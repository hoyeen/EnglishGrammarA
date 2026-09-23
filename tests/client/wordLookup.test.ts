// @vitest-environment node
import { expect, it, vi } from "vitest";
import { WordLookupClient } from "@/client/wordLookup";

const input = { sentence: "I saw a saw.", word: "saw", start: 2, end: 5 };
const result = { word: "saw", start: 2, end: 5, meaning: "看见", lemma: "see", phonetic: null, source: null };
const signal = () => new AbortController().signal;

it("coalesces pending requests and caches by sentence and position, preserving case", async () => {
  const fetcher = vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    return Response.json({ ...result, start: body.start, end: body.end });
  });
  const client = new WordLookupClient(fetcher);
  await Promise.all([client.lookup(input, signal()), client.lookup(input, signal())]);
  await client.lookup(input, signal());
  expect(fetcher).toHaveBeenCalledOnce();
  await client.lookup({ ...input, start: 8, end: 11 }, signal());
  await client.lookup({ ...input, sentence: "I saw a dog." }, signal());
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("expires incomplete results after 30 seconds and complete results after 30 minutes", async () => {
  let now = 0;
  const source = { url: "https://en.wiktionary.org/wiki/saw", license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } };
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(result)));
  const client = new WordLookupClient(fetcher, () => now);
  await client.lookup(input, signal()); now = 29_999;
  await client.lookup(input, signal()); expect(fetcher).toHaveBeenCalledOnce(); now = 30_000;
  fetcher.mockImplementation(() => Promise.resolve(Response.json({ ...result, phonetic: { text: "/sɔː/", accent: "UK" }, source })));
  await client.lookup(input, signal()); now += 1_799_999;
  await client.lookup(input, signal()); expect(fetcher).toHaveBeenCalledTimes(2); now += 1;
  await client.lookup(input, signal()); expect(fetcher).toHaveBeenCalledTimes(3);
});

it("does not cache failed or mismatched responses, and forced retry bypasses a partial cache", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ code: "RATE_LIMITED" }, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ ...result, start: 8, end: 11 }))
    .mockImplementation(() => Promise.resolve(Response.json(result)));
  const client = new WordLookupClient(fetcher);
  await expect(client.lookup(input, signal())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await expect(client.lookup(input, signal())).rejects.toThrow();
  await client.lookup(input, signal());
  await client.lookup(input, signal(), true);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("cancels a subscriber independently and aborts upstream only when none remain", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const client = new WordLookupClient(fetcher);
  const a = new AbortController(); const b = new AbortController();
  const first = client.lookup(input, a.signal);
  const second = client.lookup(input, b.signal);
  const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
  a.abort();
  await cancelled;
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
  finish(Response.json(result));
  expect(await second).toEqual(result);

  const c = new AbortController(); const d = new AbortController();
  const third = client.lookup({ ...input, sentence: "I saw a dog." }, c.signal);
  const fourth = client.lookup({ ...input, sentence: "I saw a dog." }, d.signal);
  const thirdCancelled = expect(third).rejects.toMatchObject({ name: "AbortError" });
  const fourthCancelled = expect(fourth).rejects.toMatchObject({ name: "AbortError" });
  d.abort(); await fourthCancelled;
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false);
  c.abort(); await thirdCancelled;
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  finish(Response.json(result));
});
