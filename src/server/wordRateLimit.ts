import { MemoryRateLimiter, UpstashRateLimiter, getClientKey } from "@/server/rateLimit";

const wordLimiter = new MemoryRateLimiter(30, 60_000);
const dictionaryLimiter = new MemoryRateLimiter(900, 3_600_000);

export function consumeWordRateLimit(request: Request) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const limiter = url && token
    ? new UpstashRateLimiter(url, token, 30, 60, fetch, "word-lookup")
    : wordLimiter;
  return limiter.consume(getClientKey(request));
}

export async function consumeDictionaryBudget(now = Date.now()) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Global application budget is conservative when deployment egress IPs are unknown.
  const key = `global:${Math.floor(now / 3_600_000)}`;
  try {
    if (url && token) {
      return await new UpstashRateLimiter(url, token, 900, 3_600, fetch, "word-dictionary").consume(key);
    }
    if (process.env.NODE_ENV === "production" && process.env.WORD_DICTIONARY_SINGLE_INSTANCE !== "true") return false;
    return await dictionaryLimiter.consume(key, now);
  } catch { return false; }
}

export function resetWordLimitsForTests() { wordLimiter.reset(); dictionaryLimiter.reset(); }
