import { expect, it, vi } from "vitest";
import { analyzeSentence } from "@/server/analyzeSentence";
import { ModelAnalyzerError } from "@/server/modelAnalyzer";

const validModelResult = {
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
