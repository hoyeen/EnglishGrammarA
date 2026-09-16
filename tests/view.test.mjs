import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderSegments } from "../src/view.mjs";

test("renders each grammar type with its semantic class", () => {
  const html = renderSegments([
    { text: "She", type: "noun" },
    { text: " ", type: "neutral" },
    { text: "left", type: "verb" },
  ]);

  assert.match(html, /segment--noun[^>]*>She</);
  assert.match(html, /segment--neutral[^>]*> <\/span>/);
  assert.match(html, /segment--verb[^>]*>left</);
});

test("escapes user-provided text before rendering", () => {
  const html = renderSegments([{ text: "<script>alert('x')</script>", type: "neutral" }]);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("keeps highlighted segments close enough for natural reading", async () => {
  const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const segmentRule = styles.match(/\.segment\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(segmentRule, /padding:\s*\.16em\s+\.1em/);
  assert.doesNotMatch(segmentRule, /margin/);
});
