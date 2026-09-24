import { expect, it } from "vitest";
import { translationModelSchema, translationResultSchema, validateTranslationInput } from "@/domain/translation";

it("accepts short English words and phrases and trims surrounding space", () => {
  expect(validateTranslationInput(" take off ")).toEqual({ ok: true, value: "take off" });
  expect(validateTranslationInput("  ")).toMatchObject({ ok: false, code: "EMPTY" });
  expect(validateTranslationInput("中文")).toMatchObject({ ok: false, code: "NOT_ENGLISH" });
  expect(validateTranslationInput("a".repeat(101))).toMatchObject({ ok: false, code: "TOO_LONG" });
});

it("rejects empty or oversized model output", () => {
  expect(translationModelSchema.safeParse({ status: "ok", meanings: [] }).success).toBe(false);
  expect(translationModelSchema.safeParse({ status: "unknown", meanings: ["猜测"] }).success).toBe(false);
  expect(translationResultSchema.safeParse({ original: "bank", meanings: ["银行", "河岸"] }).success).toBe(true);
});
