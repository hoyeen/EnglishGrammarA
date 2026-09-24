import { MemoryRateLimiter, UpstashRateLimiter, getClientKey } from "@/server/rateLimit";

const memoryLimiter = new MemoryRateLimiter(30, 60_000);

export function consumeTranslationRateLimit(request: Request) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const limiter = url && token
    ? new UpstashRateLimiter(url, token, 30, 60, fetch, "short-translation")
    : memoryLimiter;
  return limiter.consume(getClientKey(request));
}

export function resetTranslationRateLimitForTests() { memoryLimiter.reset(); }
