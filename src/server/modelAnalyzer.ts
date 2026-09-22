import OpenAI from "openai";
import { ANALYSIS_PROMPT } from "@/server/prompt";

export type ModelAnalyzer = (sentence: string) => Promise<unknown>;

export class ModelAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ModelAnalyzerError";
  }
}

const modelAnalysisJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["valid", "not_english", "multiple_sentences"],
    },
    parts: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", minLength: 1 },
          type: {
            type: "string",
            enum: ["noun", "adjective", "adverb", "verb", "neutral"],
          },
        },
        required: ["text", "type"],
      },
    },
    translation: { type: "string" },
  },
  required: ["status", "parts", "translation"],
};

function isTransientOpenAiError(error: unknown) {
  if (
    error instanceof OpenAI.APIConnectionError ||
    error instanceof OpenAI.APIConnectionTimeoutError
  ) {
    return true;
  }

  return (
    error instanceof OpenAI.APIError &&
    typeof error.status === "number" &&
    (error.status === 408 || error.status >= 500)
  );
}

export const deepSeekModelAnalyzer: ModelAnalyzer = async (sentence) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ModelAnalyzerError("DEEPSEEK_API_KEY is not configured", false);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 30_000),
    maxRetries: 0,
  });

  try {
    const response = await client.responses.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
      instructions: ANALYSIS_PROMPT,
      input: sentence,
      max_output_tokens: 2_000,
      reasoning: { effort: "none" },
      store: false,
      tool_choice: "none",
      text: {
        format: {
          type: "json_schema",
          name: "sentence_analysis",
          strict: true,
          schema: modelAnalysisJsonSchema,
        },
      },
    });

    if (!response.output_text) {
      throw new ModelAnalyzerError("model returned no output", true);
    }

    return JSON.parse(response.output_text) as unknown;
  } catch (error) {
    if (error instanceof ModelAnalyzerError) throw error;
    if (error instanceof SyntaxError) {
      throw new ModelAnalyzerError("model returned invalid JSON", true, {
        cause: error,
      });
    }
    throw new ModelAnalyzerError(
      "model request failed",
      isTransientOpenAiError(error),
      { cause: error },
    );
  }
};
