import { ZodError } from "zod";
import { alignSegments } from "@/domain/alignSegments";
import { modelResponseSchema } from "@/domain/analysis";
import { SentenceInputError } from "@/domain/input";
import {
  deepSeekModelAnalyzer,
  ModelAnalyzerError,
  type ModelAnalyzer,
} from "@/server/modelAnalyzer";

function isRetryable(error: unknown) {
  if (error instanceof ModelAnalyzerError) return error.retryable;
  if (error instanceof ZodError) return true;
  return error instanceof Error && error.message === "model parts do not reproduce original";
}

export async function analyzeSentence(
  sentence: string,
  model: ModelAnalyzer = deepSeekModelAnalyzer,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = modelResponseSchema.parse(await model(sentence));
      if (response.status !== "valid") {
        throw new SentenceInputError(
          response.status === "not_english" ? "NOT_ENGLISH" : "MULTIPLE_SENTENCES",
        );
      }
      return alignSegments(sentence, response);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
    }
  }

  throw lastError;
}
