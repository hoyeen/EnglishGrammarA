// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createWordDictionary } from "@/server/wordDictionary";

export const dictionaryPayload = {
  entries: [{ language: { code: "en" }, partOfSpeech: "verb", forms: [], senses: [{ definition: "simple past of read", tags: ["past"] }],
    pronunciations: [{ type: "enpr", text: "red", tags: [] }, { type: "ipa", text: "/ɹɛd/", tags: ["Received Pronunciation"] }] }],
  source: { url: "https://en.wiktionary.org/wiki/read", license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } },
};

it("preserves entry evidence, uses only IPA and caches dictionary data without sentences", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(dictionaryPayload));
  const budget = vi.fn().mockResolvedValue(true);
  const lookup = createWordDictionary({ fetcher, budget });
  const signal = new AbortController().signal;
  const result = await lookup("read", signal);
  expect(result?.entries[0]).toMatchObject({ senses: [{ tags: ["past"] }], pronunciations: [{ id: "e0-p0", text: "/ɹɛd/" }] });
  expect(result?.entries[0].pronunciations).toHaveLength(1);
  await lookup("read", signal);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(budget).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).not.toContain("sentence");
});

it("does not merge uppercase and lowercase cache entries", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(dictionaryPayload)));
  const lookup = createWordDictionary({ fetcher, budget: async () => true });
  await lookup("US", new AbortController().signal);
  await lookup("us", new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("stops external dictionary requests when the shared budget is exhausted or unavailable", async () => {
  const fetcher = vi.fn();
  for (const budget of [async () => false, async () => { throw new Error("Redis unavailable"); }]) {
    expect(await createWordDictionary({ fetcher, budget })("read", new AbortController().signal)).toBeNull();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not trust or cache malformed attribution", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...dictionaryPayload, source: { ...dictionaryPayload.source, url: "https://evil.example" } })).mockResolvedValueOnce(Response.json(dictionaryPayload));
  const lookup = createWordDictionary({ fetcher, budget: async () => true });
  expect(await lookup("read", new AbortController().signal)).toBeNull();
  expect(await lookup("read", new AbortController().signal)).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("honors supplier 429 cooldown across words and retries", async () => {
  let now = 0;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "60" } })).mockImplementation(() => Promise.resolve(Response.json(dictionaryPayload)));
  const lookup = createWordDictionary({ fetcher, budget: async () => true, now: () => now });
  expect(await lookup("read", new AbortController().signal)).toBeNull();
  expect(await lookup("saw", new AbortController().signal)).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
  now = 60_000;
  expect(await lookup("read", new AbortController().signal)).not.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
