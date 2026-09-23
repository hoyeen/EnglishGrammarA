import { expect, it } from "vitest";
import { tokenizeWords, wordRequestSchema, wordResultSchema } from "@/domain/word";

it("keeps apostrophes, hyphens and UTF-16 offsets, excluding punctuation and numbers", () => {
  const sentence = "😀 John’s well-known friend said, ‘don't!’ 123.";
  const tokens = tokenizeWords(sentence);
  expect(tokens.map(t => t.word)).toEqual(["John’s", "well-known", "friend", "said", "don't"]);
  expect(tokens[0].start).toBe(3);
  for (const t of tokens) expect(sentence.slice(t.start, t.end)).toBe(t.word);
});

it("validates the whole selected occurrence rather than a substring", () => {
  expect(wordRequestSchema.safeParse({ sentence: "I saw a saw.", word: "saw", start: 8, end: 11 }).success).toBe(true);
  for (const input of [
    { sentence: "I saw a saw.", word: "saw", start: 7, end: 10 },
    { sentence: "They sawdust.", word: "saw", start: 5, end: 8 },
    { sentence: "don't", word: "don", start: 0, end: 3 },
    { sentence: "123", word: "123", start: 0, end: 3 },
    { sentence: "a".repeat(81), word: "a".repeat(81), start: 0, end: 81 },
    { sentence: "word", word: "word", start: 0, end: 4, extra: true },
  ]) expect(wordRequestSchema.safeParse(input).success).toBe(false);
});

it("rejects unsafe attribution URLs and phonetics without sources", () => {
  const result = { word: "saw", start: 2, end: 5, meaning: "看见", lemma: "see", phonetic: { text: "/sɔː/", accent: "UK" }, source: null };
  expect(wordResultSchema.safeParse(result).success).toBe(false);
  expect(wordResultSchema.safeParse({ ...result, source: { url: "javascript:alert(1)", license: { name: "license", url: "https://evil.example" } } }).success).toBe(false);
});
