import { MAX_WORD_LENGTH, WordLookupError, wordRequestSchema } from "@/domain/word";
import { lookupWord } from "@/server/lookupWord";
import { consumeWordRateLimit } from "@/server/wordRateLimit";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 4_096;
const headers = { "cache-control": "private, no-store" };

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status, headers });
}

async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "只接受 JSON 请求。", 415);
  }
  let body: unknown;
  try { body = await readJson(request); }
  catch (error) {
    return error instanceof RangeError ? errorResponse("BODY_TOO_LARGE", "请求内容过大。", 413)
      : errorResponse("INVALID_JSON", "请求格式不正确。", 400);
  }
  if (body && typeof body === "object" && "word" in body && typeof body.word === "string" && body.word.length > MAX_WORD_LENGTH) {
    const error = new WordLookupError("WORD_TOO_LONG");
    return errorResponse(error.code, error.message, error.status);
  }
  const parsed = wordRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("INVALID_WORD", "请选择原句中的完整单词。", 400);
  try {
    if (request.signal.aborted) throw new WordLookupError("REQUEST_CANCELLED");
    if (!(await consumeWordRateLimit(request))) throw new WordLookupError("RATE_LIMITED");
    return Response.json(await lookupWord(parsed.data, request.signal), { headers });
  } catch (cause) {
    const error = cause instanceof WordLookupError ? cause : new WordLookupError("LOOKUP_FAILED");
    return errorResponse(error.code, error.message, error.status);
  }
}
