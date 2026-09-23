// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { UpstashRateLimiter, consumeRateLimit, resetRateLimitsForTests } from "@/server/rateLimit";
import { consumeWordRateLimit, consumeDictionaryBudget, resetWordLimitsForTests } from "@/server/wordRateLimit";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetWordLimitsForTests(); resetRateLimitsForTests(); });

it("uses a distinct Redis namespace for word requests", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json([{ result: 1 }])));
  await new UpstashRateLimiter("https://redis.example", "token", 30, 60, fetcher, "word-lookup").consume("client");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body[0][1]).toMatch(/^rate-limit:word-lookup:/);
});

it("word requests do not consume sentence analysis quota", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); vi.stubEnv("VERCEL", "");
  const request = new Request("http://local");
  for (let i = 0; i < 30; i++) expect(await consumeWordRateLimit(request)).toBe(true);
  expect(await consumeWordRateLimit(request)).toBe(false);
  expect(await consumeRateLimit(request)).toBe(true);
});

it("enforces a shared UTC-hour dictionary budget and fails closed in unconfigured production", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WORD_DICTIONARY_SINGLE_INSTANCE", "false");
  expect(await consumeDictionaryBudget(0)).toBe(false);
  vi.stubEnv("WORD_DICTIONARY_SINGLE_INSTANCE", "true");
  for (let i = 0; i < 900; i++) expect(await consumeDictionaryBudget(0)).toBe(true);
  expect(await consumeDictionaryBudget(0)).toBe(false);
  expect(await consumeDictionaryBudget(3_600_000)).toBe(true);
});
