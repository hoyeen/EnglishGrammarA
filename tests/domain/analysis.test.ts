import { expect, it } from "vitest";
import { analysisResultSchema, modelAnalysisSchema } from "@/domain/analysis";

it("accepts full ordered model parts including neutral text", () => {
  const parsed = modelAnalysisSchema.parse({
    parts: [
      { text: "She", type: "noun" },
      { text: " ", type: "neutral" },
      { text: "left", type: "verb" },
      { text: ".", type: "neutral" },
    ],
    translation: "她离开了。",
  });

  expect(parsed.parts).toHaveLength(4);
});

it("rejects empty parts and unknown segment types", () => {
  expect(() =>
    modelAnalysisSchema.parse({
      parts: [{ text: "", type: "subject" }],
      translation: "翻译",
    }),
  ).toThrow();
});

it("rejects overlapping or out-of-range result segments", () => {
  expect(() =>
    analysisResultSchema.parse({
      original: "She left.",
      segments: [
        { start: 0, end: 3, type: "noun" },
        { start: 2, end: 20, type: "verb" },
      ],
      translation: "她离开了。",
    }),
  ).toThrow();
});
