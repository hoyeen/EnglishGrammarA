// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { selectWord } from "@/server/wordModel";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses structured Responses output with occurrence and cancellation, without automatic retries", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key"); vi.stubEnv("DEEPSEEK_BASE_URL", "https://deepseek.example");
  const selected = { status: "ok", meaning: "锯子", lemma: null, pronunciationId: null };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "r", object: "response", status: "completed", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(selected), annotations: [] }] }] }));
  vi.stubGlobal("fetch", fetcher);
  const input = { sentence: "I saw a saw.", word: "saw", start: 8, end: 11, dictionary: null };
  expect(await selectWord(input, new AbortController().signal)).toEqual(selected);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(JSON.parse(body.input)).toEqual({ ...input, selection: { before: "I saw a ", selected: "saw", after: "." } });
  expect(body).toMatchObject({ store: false, reasoning: { effort: "none" }, text: { format: { strict: true } } });
  fetcher.mockClear().mockResolvedValue(Response.json({ error: { message: "private failure" } }, { status: 503 }));
  await expect(selectWord(input, new AbortController().signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("explicitly separates the first occurrence from an identical later word", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "r", object: "response", status: "completed", output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"status":"ok","meaning":"看见","lemma":"see","pronunciationId":null}', annotations: [] }] }] }));
  vi.stubGlobal("fetch", fetcher);
  await selectWord({ sentence: "I saw a saw.", word: "saw", start: 2, end: 5, dictionary: null }, new AbortController().signal);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(JSON.parse(body.input).selection).toEqual({ before: "I ", selected: "saw", after: " a saw." });
});
