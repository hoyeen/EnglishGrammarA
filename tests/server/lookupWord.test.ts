// @vitest-environment node
import { expect, it, vi } from "vitest";
import { lookupWord } from "@/server/lookupWord";
import type { WordDictionary } from "@/server/wordDictionary";

const input = { sentence: "I read it yesterday.", word: "read", start: 2, end: 6 };
const dictionary: WordDictionary = {
  entries: [{ id: "e0", partOfSpeech: "verb", senses: [{ definition: "past of read", tags: ["past"] }], forms: [], pronunciations: [{ id: "e0-p0", text: "/ɹɛd/", tags: ["Received Pronunciation"] }] }],
  source: { url: "https://en.wiktionary.org/wiki/read", license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } },
};
const selection = { status: "ok", meaning: "读", lemma: "read", pronunciationId: "e0-p0" };

it("uses the selected occurrence, resolves IPA from evidence and suppresses same-form lemma", async () => {
  const select = vi.fn().mockResolvedValue(selection);
  const result = await lookupWord(input, undefined, { dictionary: async () => dictionary, select });
  expect(result).toMatchObject({ word: "read", start: 2, end: 6, meaning: "读", lemma: null, phonetic: { text: "/ɹɛd/", accent: "UK" } });
  expect(select.mock.calls[0][0]).toMatchObject({ ...input, dictionary });
});

it("degrades a failed dictionary to meaning only and never accepts invented IPA", async () => {
  const result = await lookupWord(input, undefined, { dictionary: async () => { throw new Error("offline"); }, select: async () => selection });
  expect(result.phonetic).toBeNull();
  expect(result.meaning).toBe("读");
  const invalid = await lookupWord(input, undefined, { dictionary: async () => dictionary, select: async () => ({ ...selection, pronunciationId: "fake" }) });
  expect(invalid.phonetic).toBeNull();
});

it("rejects unknown, malformed and injected extra output fields", async () => {
  for (const output of [
    { status: "unknown", meaning: "", lemma: null, pronunciationId: null },
    { ...selection, ipa: "/invented/" },
    { ...selection, meaning: "" },
  ]) await expect(lookupWord(input, undefined, { dictionary: async () => dictionary, select: async () => output })).rejects.toThrow();
});

it("rejects invalid input and already cancelled requests before either provider", async () => {
  const select = vi.fn();
  const getDictionary = vi.fn();
  const controller = new AbortController();
  controller.abort();
  await expect(lookupWord(input, controller.signal, { dictionary: getDictionary, select })).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
  await expect(lookupWord({ ...input, start: 3 }, undefined, { dictionary: getDictionary, select })).rejects.toMatchObject({ code: "INVALID_WORD" });
  expect(select).not.toHaveBeenCalled();
  expect(getDictionary).not.toHaveBeenCalled();
});

it("stops a provider that ignores cancellation at the total deadline", async () => {
  vi.useFakeTimers();
  try {
    const promise = lookupWord(input, undefined, { dictionary: async () => dictionary, select: () => new Promise(() => {}), timeoutMs: 50 });
    const assertion = expect(promise).rejects.toMatchObject({ code: "LOOKUP_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  } finally { vi.useRealTimers(); }
});
