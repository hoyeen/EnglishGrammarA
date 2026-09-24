import { z } from "zod";

export const MAX_TRANSLATION_LENGTH = 100;

export const translationRequestSchema = z.object({
  text: z.string(),
}).strict();

export const translationModelSchema = z.object({
  status: z.enum(["ok", "unknown", "not_english"]),
  meanings: z.array(z.string().trim().min(1).max(80)).max(3),
}).strict().refine(value => value.status === "ok" ? value.meanings.length > 0 : value.meanings.length === 0);

export const translationResultSchema = z.object({
  original: z.string().min(1).max(MAX_TRANSLATION_LENGTH),
  meanings: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
}).strict();

export type TranslationResult = z.infer<typeof translationResultSchema>;

export function validateTranslationInput(raw: string) {
  const text = raw.trim();
  if (!text) return { ok: false, code: "EMPTY", message: "请输入英文单词或短语。" } as const;
  if (raw.length > MAX_TRANSLATION_LENGTH) return { ok: false, code: "TOO_LONG", message: `不能超过 ${MAX_TRANSLATION_LENGTH} 个字符。` } as const;
  if (!/[A-Za-z]/.test(text)) return { ok: false, code: "NOT_ENGLISH", message: "请输入英文单词或短语。" } as const;
  return { ok: true, value: text } as const;
}
