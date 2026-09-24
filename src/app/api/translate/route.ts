import { translationRequestSchema, validateTranslationInput } from "@/domain/translation";
import { TranslationError, translateText } from "@/server/translateText";
import { consumeTranslationRateLimit } from "@/server/translationRateLimit";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 1_024;
const headers = { "cache-control": "private, no-store" };

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status, headers });
}

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "只接受 JSON 请求。", 415);
  }
  let body: unknown;
  try { body = await readBody(request); }
  catch (error) {
    return error instanceof RangeError ? errorResponse("BODY_TOO_LARGE", "请求内容过大。", 413)
      : errorResponse("INVALID_JSON", "请求格式不正确。", 400);
  }
  const parsed = translationRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("INVALID_REQUEST", "请求格式不正确。", 400);
  const validation = validateTranslationInput(parsed.data.text);
  if (!validation.ok) return errorResponse(validation.code, validation.message, 400);
  try {
    if (request.signal.aborted) return errorResponse("REQUEST_CANCELLED", "请求已取消。", 408);
    if (!(await consumeTranslationRateLimit(request))) return errorResponse("RATE_LIMITED", "翻译过于频繁，请稍后再试。", 429);
    return Response.json(await translateText(validation.value, request.signal), { headers });
  } catch (error) {
    if (error instanceof TranslationError) {
      const status = error.code === "NOT_ENGLISH" ? 400 : error.code === "UNKNOWN" ? 422 : error.code === "TIMEOUT" ? 504 : 502;
      return errorResponse(error.code, error.message, status);
    }
    return errorResponse("FAILED", "翻译失败，请重试。", 502);
  }
}
