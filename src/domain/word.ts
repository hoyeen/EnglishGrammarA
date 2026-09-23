import { z } from "zod";
import { MAX_SENTENCE_LENGTH } from "@/domain/input";

export const MAX_WORD_LENGTH = 80;
export interface WordToken { word: string; start: number; end: number }

export function tokenizeWords(sentence: string): WordToken[] {
  return Array.from(sentence.matchAll(/[\p{L}\p{M}]+(?:['’\-‐‑][\p{L}\p{M}]+)*/gu))
    .filter(match => /[a-z]/i.test(match[0]))
    .map(match => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
}

export const wordRequestSchema = z.object({
  sentence: z.string().min(1).max(MAX_SENTENCE_LENGTH),
  word: z.string().min(1).max(MAX_WORD_LENGTH),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
}).strict().refine(value => tokenizeWords(value.sentence).some(token =>
  token.start === value.start && token.end === value.end && token.word === value.word,
), "请选择完整单词。");
export type WordRequest = z.infer<typeof wordRequestSchema>;

function isWiktionaryUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "en.wiktionary.org" && !url.port && !url.username && !url.password;
  } catch { return false; }
}

export const wordSourceSchema = z.object({
  url: z.string().url().refine(isWiktionaryUrl),
  license: z.object({
    name: z.literal("CC BY-SA 4.0"),
    url: z.enum(["https://creativecommons.org/licenses/by-sa/4.0/", "https://creativecommons.org/licenses/by-sa/4.0"]),
  }),
});

export const wordResultSchema = z.object({
  word: z.string().min(1).max(MAX_WORD_LENGTH),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  meaning: z.string().trim().min(1).max(160),
  lemma: z.string().min(1).max(MAX_WORD_LENGTH).nullable(),
  phonetic: z.object({ text: z.string().min(1).max(150), accent: z.enum(["UK", "US"]).nullable() }).strict().nullable(),
  source: wordSourceSchema.nullable(),
}).strict().refine(value => !value.phonetic || value.source !== null);
export type WordResult = z.infer<typeof wordResultSchema>;

const errors = {
  INVALID_WORD: [400, "请选择原句中的完整单词。"],
  WORD_TOO_LONG: [400, "暂不支持查询超过 80 个字符的单词。"],
  UNKNOWN_WORD: [422, "暂时无法确定这个词在本句中的含义。"],
  RATE_LIMITED: [429, "查词过于频繁，请稍后再试。"],
  LOOKUP_TIMEOUT: [504, "查词超时，请重试。"],
  LOOKUP_FAILED: [502, "查词失败，请重试。"],
  REQUEST_CANCELLED: [408, "查询已取消。"],
} as const;
export type WordErrorCode = keyof typeof errors;
export function wordErrorFromCode(code: unknown) {
  return new WordLookupError(typeof code === "string" && Object.hasOwn(errors, code) ? code as WordErrorCode : "LOOKUP_FAILED");
}
export class WordLookupError extends Error {
  readonly status: number;
  constructor(readonly code: WordErrorCode) {
    super(errors[code][1]);
    this.name = "WordLookupError";
    this.status = errors[code][0];
  }
}
