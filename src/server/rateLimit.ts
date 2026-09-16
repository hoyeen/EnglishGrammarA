import { createHash } from "node:crypto";

export interface RateLimiter {
  consume(key: string, now?: number): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string, now = Date.now()) {
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;

    current.count += 1;
    return true;
  }

  reset() {
    this.buckets.clear();
  }
}

type Fetcher = typeof fetch;

export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly limit: number,
    private readonly windowSeconds: number,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async consume(key: string) {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const redisKey = `rate-limit:sentence-analysis:${digest}`;
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, this.windowSeconds, "NX"],
      ]),
      cache: "no-store",
    });

    if (!response.ok) throw new Error("shared rate limiter unavailable");

    const payload = (await response.json()) as Array<{ result?: unknown }>;
    const count = payload[0]?.result;
    if (typeof count !== "number") {
      throw new Error("shared rate limiter returned an invalid response");
    }
    return count <= this.limit;
  }
}

const configuredLimit = Number(process.env.RATE_LIMIT_MAX ?? 10);
const configuredWindowSeconds = Number(
  process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60,
);
const memoryRateLimiter = new MemoryRateLimiter(
  configuredLimit,
  configuredWindowSeconds * 1_000,
);

function getRateLimiter(): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new UpstashRateLimiter(
      url,
      token,
      configuredLimit,
      configuredWindowSeconds,
    );
  }
  return memoryRateLimiter;
}

export function getClientKey(request: Request, isTrustedProxy = Boolean(process.env.VERCEL)) {
  if (!isTrustedProxy) return "local";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function consumeRateLimit(request: Request) {
  return getRateLimiter().consume(getClientKey(request));
}

export function resetRateLimitsForTests() {
  memoryRateLimiter.reset();
}
