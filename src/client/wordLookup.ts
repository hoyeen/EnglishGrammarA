import { TtlCache } from "@/domain/ttlCache";
import { WordLookupError, wordErrorFromCode, wordRequestSchema, wordResultSchema, type WordRequest, type WordResult } from "@/domain/word";

interface PendingLookup {
  controller: AbortController;
  promise: Promise<WordResult>;
  consumers: number;
  settled: boolean;
}

export class WordLookupClient {
  private readonly cache: TtlCache<WordResult>;
  private readonly pending = new Map<string, PendingLookup>();

  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args), now = Date.now) {
    this.cache = new TtlCache<WordResult>(100, now);
  }

  lookup(input: WordRequest, signal: AbortSignal, force = false): Promise<WordResult> {
    if (!wordRequestSchema.safeParse(input).success) return Promise.reject(new WordLookupError("INVALID_WORD"));
    if (signal.aborted) return Promise.reject(signal.reason);
    const key = JSON.stringify(["word-v1", input.sentence, input.word, input.start, input.end, "zh"]);
    if (force) this.cache.delete(key);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending && !pending.controller.signal.aborted) return this.subscribe(pending, signal);
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(20_000);
    const combined = AbortSignal.any([controller.signal, deadline]);
    const promise = (async () => {
      try {
        const response = await this.fetcher("/api/word", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: combined, cache: "no-store" });
        const body: unknown = await response.json();
        combined.throwIfAborted();
        if (!response.ok) throw wordErrorFromCode(body && typeof body === "object" && "code" in body ? body.code : null);
        const parsed = wordResultSchema.safeParse(body);
        if (!parsed.success || parsed.data.word !== input.word || parsed.data.start !== input.start || parsed.data.end !== input.end) throw new WordLookupError("LOOKUP_FAILED");
        this.cache.set(key, parsed.data, parsed.data.phonetic ? 1_800_000 : 30_000);
        return parsed.data;
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (deadline.aborted) throw new WordLookupError("LOOKUP_TIMEOUT");
        throw error instanceof WordLookupError ? error : new WordLookupError("LOOKUP_FAILED");
      }
    })().finally(() => {
      entry.settled = true;
      if (this.pending.get(key) === entry) this.pending.delete(key);
    });
    const entry: PendingLookup = { controller, promise, consumers: 0, settled: false };
    this.pending.set(key, entry);
    return this.subscribe(entry, signal);
  }

  private subscribe(entry: PendingLookup, signal: AbortSignal): Promise<WordResult> {
    entry.consumers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal.removeEventListener("abort", cancel);
        entry.consumers -= 1;
        if (entry.consumers === 0 && !entry.settled) entry.controller.abort();
        return true;
      };
      const cancel = () => { if (release()) reject(signal.reason); };
      signal.addEventListener("abort", cancel, { once: true });
      entry.promise.then(value => { if (release()) resolve(value); }, error => { if (release()) reject(error); });
      if (signal.aborted) cancel();
    });
  }
}
