// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/server/lookupWord", () => ({ lookupWord: vi.fn() }));
vi.mock("@/server/wordRateLimit", () => ({ consumeWordRateLimit: vi.fn() }));
import { POST } from "@/app/api/word/route";
import { lookupWord } from "@/server/lookupWord";
import { consumeWordRateLimit } from "@/server/wordRateLimit";
import { WordLookupError } from "@/domain/word";

const input = { sentence: "I saw a saw.", word: "saw", start: 8, end: 11 };
const result = { word: "saw", start: 8, end: 11, meaning: "锯子", lemma: null, phonetic: null, source: null };
const request = (body: unknown = input, type = "application/json") => new Request("http://local/api/word", { method: "POST", headers: { "content-type": type }, body: JSON.stringify(body) });
beforeEach(() => { vi.mocked(lookupWord).mockReset().mockResolvedValue(result); vi.mocked(consumeWordRateLimit).mockReset().mockResolvedValue(true); });
afterEach(() => vi.restoreAllMocks());

it("returns the exact occurrence with private no-store headers", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual(result);
  expect(lookupWord).toHaveBeenCalledWith(input, expect.any(AbortSignal));
});

it("rejects word fragments, extra fields, invalid JSON and oversized payloads before any providers", async () => {
  for (const req of [
    request({ ...input, word: "sa", end: 10 }), request({ ...input, extra: true }),
    new Request("http://local", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
    request({ sentence: "x".repeat(5000) }),
  ]) expect((await POST(req)).status).toBeGreaterThanOrEqual(400);
  expect(lookupWord).not.toHaveBeenCalled();
  expect(consumeWordRateLimit).not.toHaveBeenCalled();
  expect((await POST(request(input, "text/plain"))).status).toBe(415);
});

it("returns 429 without invoking the word model", async () => {
  vi.mocked(consumeWordRateLimit).mockResolvedValue(false);
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
  expect(lookupWord).not.toHaveBeenCalled();
});

it("maps timeouts and internal failures to fixed messages without leaking provider errors", async () => {
  vi.mocked(lookupWord).mockRejectedValueOnce(new WordLookupError("LOOKUP_TIMEOUT")).mockRejectedValueOnce(new Error("secret-provider-key"));
  expect((await POST(request())).status).toBe(504);
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ code: "LOOKUP_FAILED", message: "查词失败，请重试。" });
});
