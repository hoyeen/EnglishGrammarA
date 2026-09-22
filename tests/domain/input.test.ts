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
    ["a".repeat(501), "TOO_LONG"],
  ])("rejects invalid input %#", (input, code) => {
    expect(validateSentenceInput(input)).toMatchObject({ ok: false, code });
  });

  it("does not treat common abbreviations as a second sentence", () => {
    expect(validateSentenceInput("Dr. Smith arrived early.").ok).toBe(true);
  });

  it.each([
    "J. K. Rowling wrote the book.",
    "The U.S. economy grew.",
    'He said, "Go now."',
    "He left. She stayed",
    "He left. she stayed.",
    '"He left." She stayed.',
    "我今天学习English，但是完全不知道怎么做。",
  ])("defers semantic validation to the model: %s", (input) => {
    expect(validateSentenceInput(input)).toEqual({ ok: true, value: input });
  });

  it.each([499, 500])("accepts %i characters", (length) => {
    expect(validateSentenceInput("a".repeat(length)).ok).toBe(true);
  });

  it("counts surrounding whitespace toward the input limit", () => {
    expect(validateSentenceInput(` ${"a".repeat(499)} `)).toMatchObject({
      ok: false,
      code: "TOO_LONG",
    });
  });

  it("preserves interior whitespace and trims only the outside", () => {
    expect(validateSentenceInput("  She  left.  ")).toEqual({
      ok: true,
      value: "She  left.",
    });
  });
});
