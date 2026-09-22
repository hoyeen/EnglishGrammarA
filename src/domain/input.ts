export type InputErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "NOT_ENGLISH"
  | "MULTIPLE_SENTENCES";

export type InputValidation =
  | { ok: true; value: string }
  | { ok: false; code: InputErrorCode; message: string };

export const MAX_SENTENCE_LENGTH = 500;

type SemanticInputErrorCode = Extract<InputErrorCode, "NOT_ENGLISH" | "MULTIPLE_SENTENCES">;

const semanticInputMessages: Record<SemanticInputErrorCode, string> = {
  NOT_ENGLISH: "目前仅支持英文句子。",
  MULTIPLE_SENTENCES: "一次只能分析一个句子。",
};

export class SentenceInputError extends Error {
  constructor(public readonly code: SemanticInputErrorCode) {
    super(semanticInputMessages[code]);
    this.name = "SentenceInputError";
  }
}

export function validateSentenceInput(raw: string): InputValidation {
  if (raw.length > MAX_SENTENCE_LENGTH) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: "句子不能超过 500 个字符。",
    };
  }

  const value = raw.trim();
  if (!value) {
    return { ok: false, code: "EMPTY", message: "请先输入一个英文句子。" };
  }
  if (!/[A-Za-z]/.test(value)) {
    return {
      ok: false,
      code: "NOT_ENGLISH",
      message: "目前仅支持英文句子。",
    };
  }

  // Punctuation and mixed-language meaning are judged in the same model call
  // as the analysis, so initials and quotations are not rejected heuristically.
  return { ok: true, value };
}
