import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/analyzeSentence", () => ({ analyzeSentence: vi.fn() }));

import { POST } from "@/app/api/analyze/route";
import { analyzeSentence } from "@/server/analyzeSentence";
import { resetRateLimitsForTests } from "@/server/rateLimit";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://local/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.mocked(analyzeSentence).mockReset();
    resetRateLimitsForTests();
    vi.stubEnv("VERCEL", "");
  });

  it("returns 400 for invalid sentence input", async () => {
    const response = await POST(jsonRequest({ sentence: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "EMPTY" });
  });

  it("rejects non-JSON requests and extra fields", async () => {
    const plain = await POST(
      new Request("http://local/api/analyze", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "She left.",
      }),
    );
    const extra = await POST(jsonRequest({ sentence: "She left.", admin: true }));

    expect(plain.status).toBe(415);
    expect(extra.status).toBe(400);
  });

  it("returns a validated analysis", async () => {
    vi.mocked(analyzeSentence).mockResolvedValue({
      original: "She left.",
      segments: [
        { start: 0, end: 3, type: "noun" },
        { start: 4, end: 8, type: "verb" },
      ],
      translation: "她离开了。",
    });

    const response = await POST(jsonRequest({ sentence: "She left." }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ original: "She left." });
  });

  it("maps internal failures without leaking their messages", async () => {
    vi.mocked(analyzeSentence).mockRejectedValue(new Error("secret upstream detail"));

    const response = await POST(jsonRequest({ sentence: "She left." }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ code: "ANALYSIS_FAILED", message: "分析失败，请重试。" });
    expect(JSON.stringify(body)).not.toContain("secret upstream detail");
  });

  it("rate limits the eleventh request", async () => {
    vi.mocked(analyzeSentence).mockResolvedValue({
      original: "She left.",
      segments: [],
      translation: "她离开了。",
    });
    let response = new Response();
    for (let index = 0; index < 11; index += 1) {
      response = await POST(jsonRequest({ sentence: "She left." }));
    }

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
  });
});
