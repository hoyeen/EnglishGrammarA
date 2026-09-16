import { z } from "zod";
import { validateSentenceInput } from "@/domain/input";
import { analyzeSentence } from "@/server/analyzeSentence";
import { consumeRateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_048;
const requestSchema = z.object({ sentence: z.string() }).strict();

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "只接受 JSON 请求。", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse("BODY_TOO_LARGE", "请求内容过大。", 413);
  }

  let parsedBody: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return errorResponse("BODY_TOO_LARGE", "请求内容过大。", 413);
    }
    parsedBody = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("INVALID_JSON", "请求格式不正确。", 400);
  }

  const requestBody = requestSchema.safeParse(parsedBody);
  if (!requestBody.success) {
    return errorResponse("INVALID_REQUEST", "请求格式不正确。", 400);
  }

  const validation = validateSentenceInput(requestBody.data.sentence);
  if (!validation.ok) {
    return errorResponse(validation.code, validation.message, 400);
  }

  try {
    if (!(await consumeRateLimit(request))) {
      return errorResponse("RATE_LIMITED", "请求过于频繁，请稍后再试。", 429);
    }

    return Response.json(await analyzeSentence(validation.value));
  } catch (error) {
    console.error("analysis request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("ANALYSIS_FAILED", "分析失败，请重试。", 502);
  }
}
