import { expect, it } from "vitest";
import { alignSegments } from "@/domain/alignSegments";

it("computes offsets while preserving neutral text", () => {
  expect(
    alignSegments("She left.", {
      parts: [
        { text: "She", type: "noun" },
        { text: " ", type: "neutral" },
        { text: "left", type: "verb" },
        { text: ".", type: "neutral" },
      ],
      translation: "她离开了。",
    }),
  ).toEqual({
    original: "She left.",
    segments: [
      { start: 0, end: 3, type: "noun" },
      { start: 4, end: 8, type: "verb" },
    ],
    translation: "她离开了。",
  });
});

it("rejects any model rewrite of whitespace in the original", () => {
  expect(() =>
    alignSegments("She  left.", {
      parts: [{ text: "She left.", type: "noun" }],
      translation: "她离开了。",
    }),
  ).toThrow("model parts do not reproduce original");
});

it("aligns repeated text and UTF-16 characters by cumulative position", () => {
  expect(
    alignSegments("Go, go 🚀!", {
      parts: [
        { text: "Go", type: "verb" },
        { text: ", ", type: "neutral" },
        { text: "go", type: "verb" },
        { text: " ", type: "neutral" },
        { text: "🚀", type: "noun" },
        { text: "!", type: "neutral" },
      ],
      translation: "出发，冲向太空！",
    }).segments,
  ).toEqual([
    { start: 0, end: 2, type: "verb" },
    { start: 4, end: 6, type: "verb" },
    { start: 7, end: 9, type: "noun" },
  ]);
});
