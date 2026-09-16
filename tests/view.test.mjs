import test from "node:test";
import assert from "node:assert/strict";
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
