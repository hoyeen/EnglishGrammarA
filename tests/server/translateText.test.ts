// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callDeepSeek, translateText } from "@/server/translateText";

const fetchMock = vi.fn<typeof fetch>();

function modelResponse(text: string) {
  return Response.json({ id: "response-test", object: "response", status: "completed", output: [{
    id: "message-test", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  }] });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.example");
  vi.stubEnv("DEEPSEEK_MODEL", "test-model");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses existing DeepSeek Responses configuration for short translations", async () => {
  fetchMock.mockResolvedValue(modelResponse(JSON.stringify({ status: "ok", meanings: ["起飞"] })));
  await expect(callDeepSeek("take off")).resolves.toEqual({ status: "ok", meanings: ["起飞"] });
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://deepseek.example/responses");
  const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  expect(sent).toMatchObject({ model: "test-model", input: "take off", store: false, tool_choice: "none", text: { format: { type: "json_schema", strict: true } } });
});

it("validates meanings and handles unknown words without inventing a translation", async () => {
  await expect(translateText("bank", undefined, async () => ({ status: "ok", meanings: ["银行", "河岸", "银行"] })))
    .resolves.toEqual({ original: "bank", meanings: ["银行", "河岸"] });
  await expect(translateText("xyzzy", undefined, async () => ({ status: "unknown", meanings: [] })))
    .rejects.toMatchObject({ code: "UNKNOWN" });
  await expect(translateText("bank", undefined, async () => ({ status: "ok", meanings: [] })))
    .rejects.toMatchObject({ code: "FAILED" });
});
