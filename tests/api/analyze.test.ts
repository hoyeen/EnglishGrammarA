import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/analyzeSentence", () => ({ analyzeSentence: vi.fn() }));

import { POST } from "@/app/api/analyze/route";
import { analyzeSentence } from "@/server/analyzeSentence";
import { resetRateLimitsForTests } from "@/server/rateLimit";
import { SentenceInputError } from "@/domain/input";

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

  it("rejects overlong raw input before calling the model", async () => {
    const response = await POST(jsonRequest({ sentence: ` ${"a".repeat(499)} ` }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "TOO_LONG" });
    expect(analyzeSentence).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_ENGLISH", "目前仅支持英文句子。"],
    ["MULTIPLE_SENTENCES", "一次只能分析一个句子。"],
  ] as const)("returns a user-facing 400 for model-judged %s", async (code, message) => {
    vi.mocked(analyzeSentence).mockRejectedValue(new SentenceInputError(code));
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(jsonRequest({ sentence: "He left. She stayed" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code, message });
    expect(logger).not.toHaveBeenCalled();
  });

  it("allows initials through to analysis instead of rejecting them locally", async () => {
    const sentence = "J. K. Rowling wrote the book.";
    vi.mocked(analyzeSentence).mockResolvedValue({
      original: sentence,
      segments: [{ start: 0, end: 12, type: "noun" }],
      translation: "J. K. 罗琳写了这本书。",
    });

    const response = await POST(jsonRequest({ sentence }));

    expect(response.status).toBe(200);
    expect(analyzeSentence).toHaveBeenCalledExactlyOnceWith(sentence);
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
