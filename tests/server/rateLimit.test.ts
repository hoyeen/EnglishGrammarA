import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRateLimiter,
  UpstashRateLimiter,
  getClientKey,
} from "@/server/rateLimit";

describe("MemoryRateLimiter", () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    limiter = new MemoryRateLimiter(10, 60_000);
  });

  it("allows ten requests and blocks the eleventh", async () => {
    for (let request = 0; request < 10; request += 1) {
      await expect(limiter.consume("127.0.0.1", 0)).resolves.toBe(true);
    }
    await expect(limiter.consume("127.0.0.1", 0)).resolves.toBe(false);
  });

  it("opens a new window after one minute", async () => {
    for (let request = 0; request < 10; request += 1) {
      await limiter.consume("127.0.0.1", 0);
    }
    await expect(limiter.consume("127.0.0.1", 60_000)).resolves.toBe(true);
  });
});

it("uses forwarded IP only on the trusted Vercel platform", () => {
  const request = new Request("http://local", {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });

  expect(getClientKey(request, false)).toBe("local");
  expect(getClientKey(request, true)).toBe("203.0.113.9");
});

it("uses an atomic Upstash pipeline and applies the configured limit", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([{ result: 11 }, { result: 1 }]), {
      status: 200,
    }),
  );
  const limiter = new UpstashRateLimiter(
    "https://redis.example",
    "secret",
    10,
    60,
    fetcher,
  );

  await expect(limiter.consume("client-key")).resolves.toBe(false);
  expect(fetcher).toHaveBeenCalledWith(
    "https://redis.example/pipeline",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer secret" }),
    }),
  );
});
