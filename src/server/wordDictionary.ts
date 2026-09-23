import { z } from "zod";
import { TtlCache } from "@/domain/ttlCache";
import { wordSourceSchema } from "@/domain/word";
import { consumeDictionaryBudget } from "@/server/wordRateLimit";

const tags = z.array(z.string().max(100)).max(100).default([]);
const dictionarySchema = z.object({
  entries: z.array(z.object({
    language: z.object({ code: z.string() }), partOfSpeech: z.string().max(100),
    pronunciations: z.array(z.object({ type: z.string(), text: z.string().max(150), tags })),
    forms: z.array(z.object({ word: z.string(), tags })),
    senses: z.array(z.object({ definition: z.string(), tags })),
  })).max(500),
  source: wordSourceSchema,
});

function compactDictionary(payload: unknown) {
  const parsed = dictionarySchema.parse(payload);
  return {
    entries: parsed.entries.filter(entry => entry.language.code === "en").slice(0, 24).map((entry, i) => ({
      id: `e${i}`, partOfSpeech: entry.partOfSpeech,
      senses: entry.senses.slice(0, 16).map(sense => ({ definition: sense.definition.slice(0, 350), tags: sense.tags })),
      forms: entry.forms.slice(0, 48).map(form => ({ word: form.word.slice(0, 80), tags: form.tags })),
      pronunciations: entry.pronunciations.filter(p => p.type === "ipa").slice(0, 32).map((p, j) => ({ id: `e${i}-p${j}`, text: p.text, tags: p.tags })),
    })),
    source: parsed.source,
  };
}
export type WordDictionary = ReturnType<typeof compactDictionary>;
export type DictionaryLookup = (word: string, signal: AbortSignal) => Promise<WordDictionary | null>;

export function createWordDictionary({ fetcher = fetch, budget = consumeDictionaryBudget, now = Date.now }: {
  fetcher?: typeof fetch; budget?: () => Promise<boolean>; now?: () => number;
} = {}): DictionaryLookup {
  const cache = new TtlCache<WordDictionary>(500, now);
  let blockedUntil = 0;
  return async (word, signal) => {
    const query = word.replaceAll("’", "'").replace(/[‐‑]/g, "-");
    const key = `freedictionary-v1:en:${query}`;
    const cached = cache.get(key);
    if (cached) return cached;
    if (now() < blockedUntil) return null;
    try {
      signal.throwIfAborted();
      if (!(await budget())) return null;
      signal.throwIfAborted();
      const response = await fetcher(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(query)}?translations=false`, { signal, cache: "no-store" });
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const instant = now();
        const suggested = retryAfter && /^\d+$/.test(retryAfter) ? instant + Number(retryAfter) * 1_000
          : retryAfter ? Date.parse(retryAfter) : NaN;
        const hourEnd = (Math.floor(instant / 3_600_000) + 1) * 3_600_000;
        blockedUntil = Number.isFinite(suggested) ? Math.max(instant + 1_000, suggested) : hourEnd;
        return null;
      }
      if (!response.ok) return null;
      const raw = await response.text();
      if (raw.length > 1_000_000) return null;
      const dictionary = compactDictionary(JSON.parse(raw));
      // Empty entries are not cached: a temporary provider omission should be retryable.
      if (dictionary.entries.length) cache.set(key, dictionary, 3_600_000);
      return dictionary;
    } catch { return null; }
  };
}

let defaultLookup: DictionaryLookup | undefined;
export const lookupDictionary: DictionaryLookup = (word, signal) => {
  defaultLookup ??= createWordDictionary();
  return defaultLookup(word, signal);
};
