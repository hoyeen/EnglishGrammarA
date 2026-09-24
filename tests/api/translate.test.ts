// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/translateText", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/translateText")>();
  return { ...original, translateText: vi.fn() };
});

import { POST } from "@/app/api/translate/route";
import { translateText, TranslationError } from "@/server/translateText";
import { resetTranslationRateLimitForTests } from "@/server/translationRateLimit";

const request = (body: unknown) => new Request("http://local/api/translate", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.mocked(translateText).mockReset();
  resetTranslationRateLimitForTests();
  vi.stubEnv("VERCEL", "");
});

it("returns a short translation with a private response", async () => {
  vi.mocked(translateText).mockResolvedValue({ original: "take off", meanings: ["起飞"] });
  const response = await POST(request({ text: " take off " }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(translateText).toHaveBeenCalledWith("take off", expect.any(AbortSignal));
  await expect(response.json()).resolves.toEqual({ original: "take off", meanings: ["起飞"] });
});

it("rejects empty, overlong, non-English, and extra-field inputs before the model", async () => {
  for (const [body, code] of [
    [{ text: "" }, "EMPTY"], [{ text: "中" }, "NOT_ENGLISH"],
    [{ text: "a".repeat(101) }, "TOO_LONG"], [{ text: "bank", admin: true }, "INVALID_REQUEST"],
  ] as const) {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
  }
  expect(translateText).not.toHaveBeenCalled();
});

it("maps unknown translation and provider failures to safe errors", async () => {
  vi.mocked(translateText).mockRejectedValueOnce(new TranslationError("UNKNOWN"));
  const unknown = await POST(request({ text: "xyzzy" }));
  expect(unknown.status).toBe(422);
  vi.mocked(translateText).mockRejectedValueOnce(new Error("secret"));
  const failed = await POST(request({ text: "bank" }));
  expect(failed.status).toBe(502);
  await expect(failed.json()).resolves.toEqual({ code: "FAILED", message: "翻译失败，请重试。" });
});

it("limits translation requests independently", async () => {
  vi.mocked(translateText).mockResolvedValue({ original: "bank", meanings: ["银行"] });
  for (let index = 0; index < 30; index += 1) expect((await POST(request({ text: "bank" }))).status).toBe(200);
  expect((await POST(request({ text: "bank" }))).status).toBe(429);
});
