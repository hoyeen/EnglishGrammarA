export type InputErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "NOT_ENGLISH"
  | "MULTIPLE_SENTENCES";

export type InputValidation =
  | { ok: true; value: string }
  | { ok: false; code: InputErrorCode; message: string };

const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi;

export function validateSentenceInput(raw: string): InputValidation {
  const value = raw.trim();

  if (!value) {
    return { ok: false, code: "EMPTY", message: "请先输入一个英文句子。" };
  }
  if (value.length > 500) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: "句子不能超过 500 个字符。",
    };
  }
  if (!/[A-Za-z]/.test(value)) {
    return {
      ok: false,
      code: "NOT_ENGLISH",
      message: "目前仅支持英文句子。",
    };
  }

  const withoutAbbreviations = value.replace(ABBREVIATION, "");
  const sentenceEndings =
    withoutAbbreviations.match(/[.!?](?=\s+[A-Z"']|$)/g) ?? [];

  if (sentenceEndings.length > 1) {
    return {
      ok: false,
      code: "MULTIPLE_SENTENCES",
      message: "一次只能分析一个句子。",
    };
  }

  return { ok: true, value };
}
