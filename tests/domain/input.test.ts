import { describe, expect, it } from "vitest";
import { validateSentenceInput } from "@/domain/input";

describe("validateSentenceInput", () => {
  it("accepts one English sentence", () => {
    expect(validateSentenceInput("The book is interesting.")).toEqual({
      ok: true,
      value: "The book is interesting.",
    });
  });

  it.each([
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    ["这是一个中文句子。", "NOT_ENGLISH"],
    ["He left. She stayed.", "MULTIPLE_SENTENCES"],
    ["a".repeat(501), "TOO_LONG"],
  ])("rejects invalid input %#", (input, code) => {
    expect(validateSentenceInput(input)).toMatchObject({ ok: false, code });
  });

  it("does not treat common abbreviations as a second sentence", () => {
    expect(validateSentenceInput("Dr. Smith arrived early.").ok).toBe(true);
  });

  it("preserves interior whitespace and trims only the outside", () => {
    expect(validateSentenceInput("  She  left.  ")).toEqual({
      ok: true,
      value: "She  left.",
    });
  });
});
