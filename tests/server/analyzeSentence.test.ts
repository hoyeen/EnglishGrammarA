import { expect, it, vi } from "vitest";
import { analyzeSentence } from "@/server/analyzeSentence";
import { ModelAnalyzerError } from "@/server/modelAnalyzer";

const validModelResult = {
  status: "valid",
  parts: [
    { text: "She", type: "noun" },
    { text: " ", type: "neutral" },
    { text: "left", type: "verb" },
    { text: ".", type: "neutral" },
  ],
  translation: "她离开了。",
};

it("returns a validated analysis result", async () => {
  const model = vi.fn().mockResolvedValue(validModelResult);

  await expect(analyzeSentence("She left.", model)).resolves.toEqual({
    original: "She left.",
    segments: [
      { start: 0, end: 3, type: "noun" },
      { start: 4, end: 8, type: "verb" },
    ],
    translation: "她离开了。",
  });
});

it("retries once when model parts rewrite the original", async () => {
  const model = vi
    .fn()
    .mockResolvedValueOnce({
      status: "valid",
      parts: [{ text: "She left", type: "noun" }],
      translation: "她离开了。",
    })
    .mockResolvedValueOnce(validModelResult);

  await expect(analyzeSentence("She left.", model)).resolves.toMatchObject({
    original: "She left.",
  });
  expect(model).toHaveBeenCalledTimes(2);
});

it("retries a transient model failure only once", async () => {
  const model = vi
    .fn()
    .mockRejectedValueOnce(new ModelAnalyzerError("timeout", true))
    .mockResolvedValueOnce(validModelResult);

  await expect(analyzeSentence("She left.", model)).resolves.toBeDefined();
  expect(model).toHaveBeenCalledTimes(2);
});

it("does not retry a deterministic authentication failure", async () => {
  const failure = new ModelAnalyzerError("unauthorized", false);
  const model = vi.fn().mockRejectedValue(failure);

  await expect(analyzeSentence("She left.", model)).rejects.toBe(failure);
  expect(model).toHaveBeenCalledOnce();
});

it.each([
  ["not_english", "NOT_ENGLISH", "目前仅支持英文句子。"],
  ["multiple_sentences", "MULTIPLE_SENTENCES", "一次只能分析一个句子。"],
])("rejects %s without retrying or rendering analysis", async (status, code, message) => {
  const model = vi.fn().mockResolvedValue({ status, parts: [], translation: "" });

  await expect(analyzeSentence("Input to classify.", model)).rejects.toMatchObject({
    name: "SentenceInputError",
    code,
    message,
  });
  expect(model).toHaveBeenCalledOnce();
});

it.each([
  { ...validModelResult, status: undefined },
  { ...validModelResult, status: "unknown" },
  { ...validModelResult, status: "not_english" },
  { status: "multiple_sentences", parts: [], translation: "Unexpected explanation" },
])("retries a malformed semantic response instead of accepting it %#", async (response) => {
  const model = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(validModelResult);

  await expect(analyzeSentence("She left.", model)).resolves.toMatchObject({
    original: "She left.",
  });
  expect(model).toHaveBeenCalledTimes(2);
});

it("does not return analysis when both semantic responses are malformed", async () => {
  const model = vi.fn().mockResolvedValue({ ...validModelResult, status: "unknown" });

  await expect(analyzeSentence("She left.", model)).rejects.toThrow();
  expect(model).toHaveBeenCalledTimes(2);
});

it("passes initials through the same model request and preserves exact text", async () => {
  const original = "J. K. Rowling wrote the book.";
  const model = vi.fn().mockResolvedValue({
    status: "valid",
    parts: [
      { text: "J. K. Rowling", type: "noun" },
      { text: " ", type: "neutral" },
      { text: "wrote", type: "verb" },
      { text: " ", type: "neutral" },
      { text: "the book", type: "noun" },
      { text: ".", type: "neutral" },
    ],
    translation: "J. K. 罗琳写了这本书。",
  });

  await expect(analyzeSentence(original, model)).resolves.toMatchObject({ original });
  expect(model).toHaveBeenCalledExactlyOnceWith(original);
});
