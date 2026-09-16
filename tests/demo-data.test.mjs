import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMock, validateInput } from "../src/demo-data.mjs";

test("rejects empty input", () => {
  assert.deepEqual(validateInput("   "), {
    ok: false,
    message: "请先输入一个英文句子。",
  });
});

test("rejects input longer than 500 characters", () => {
  assert.deepEqual(validateInput("a".repeat(501)), {
    ok: false,
    message: "句子不能超过 500 个字符。",
  });
});

test("returns a four-color analysis for the relative-clause example", () => {
  const result = analyzeMock("The book that I bought yesterday is interesting.");

  assert.equal(result.translation, "我昨天买的那本书很有意思。");
  assert.deepEqual(
    result.segments.map(({ text, type }) => [text, type]),
    [
      ["The book", "noun"],
      [" ", "neutral"],
      ["that I bought yesterday", "adjective"],
      [" ", "neutral"],
      ["is", "verb"],
      [" ", "neutral"],
      ["interesting", "adjective"],
      [".", "neutral"],
    ],
  );
});

test("returns a generic mock analysis for arbitrary English input", () => {
  const result = analyzeMock("A new sentence appears here.");

  assert.equal(result.isFallback, true);
  assert.equal(result.segments.map((segment) => segment.text).join(""), "A new sentence appears here.");
});
