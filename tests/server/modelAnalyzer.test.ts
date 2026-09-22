// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { deepSeekModelAnalyzer } from "@/server/modelAnalyzer";

const fetchMock = vi.fn<typeof fetch>();
const validResult = {
  status: "valid",
  parts: [
    { text: "She", type: "noun" },
    { text: " ", type: "neutral" },
    { text: "left", type: "verb" },
    { text: ".", type: "neutral" },
  ],
  translation: "她离开了。",
};

function modelResponse(outputText: string) {
  return Response.json({
    id: "response-test",
    object: "response",
    status: "completed",
    output: [
      {
        id: "message-test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: outputText, annotations: [] }],
      },
    ],
  });
}

function sentRequest() {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
    text: { format: { schema: Record<string, unknown> } };
  };
}

describe("DeepSeek model adapter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.example");
    vi.stubEnv("DEEPSEEK_MODEL", "test-model");
    vi.stubEnv("DEEPSEEK_TIMEOUT_MS", "30000");
    fetchMock.mockResolvedValue(modelResponse(JSON.stringify(validResult)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the Responses API and parses a valid analysis", async () => {
    await expect(deepSeekModelAnalyzer("She left.")).resolves.toEqual(validResult);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://deepseek.example/responses");
    expect(sentRequest()).toMatchObject({
      model: "test-model",
      input: "She left.",
      max_output_tokens: 2_000,
      reasoning: { effort: "none" },
      store: false,
      tool_choice: "none",
      text: { format: { type: "json_schema", strict: true } },
    });
  });

  it("requires a supported status in the outgoing response schema", async () => {
    await deepSeekModelAnalyzer("She left.");

    const schema = sentRequest().text.format.schema;
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["status", "parts", "translation"],
      properties: {
        status: {
          type: "string",
          enum: ["valid", "not_english", "multiple_sentences"],
        },
      },
    });
    const validator = z.fromJSONSchema(schema);
    expect(validator.safeParse(validResult).success).toBe(true);
    expect(validator.safeParse({ ...validResult, status: "unknown" }).success).toBe(false);
    expect(
      validator.safeParse({ parts: validResult.parts, translation: validResult.translation }).success,
    ).toBe(false);
  });

  it.each(["not_english", "multiple_sentences"])(
    "allows an empty analysis for %s in the outgoing schema",
    async (status) => {
      await deepSeekModelAnalyzer("She left.");

      const validator = z.fromJSONSchema(sentRequest().text.format.schema);
      expect(validator.safeParse({ status, parts: [], translation: "" }).success).toBe(true);
    },
  );

  it.each(["not_english", "multiple_sentences"])(
    "returns %s to the analysis use case without inventing an analysis",
    async (status) => {
      const response = { status, parts: [], translation: "" };
      fetchMock.mockResolvedValue(modelResponse(JSON.stringify(response)));

      await expect(deepSeekModelAnalyzer("input to classify")).resolves.toEqual(response);
    },
  );

  it("marks invalid output JSON as retryable", async () => {
    fetchMock.mockResolvedValue(modelResponse("{invalid JSON"));

    await expect(deepSeekModelAnalyzer("She left.")).rejects.toMatchObject({
      name: "ModelAnalyzerError",
      message: "model returned invalid JSON",
      retryable: true,
    });
  });

  it.each([
    { status: 401, retryable: false },
    { status: 503, retryable: true },
  ])("maps HTTP $status to retryable=$retryable", async ({ status, retryable }) => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: "upstream failure" } }, { status }),
    );

    await expect(deepSeekModelAnalyzer("She left.")).rejects.toMatchObject({
      name: "ModelAnalyzerError",
      message: "model request failed",
      retryable,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
