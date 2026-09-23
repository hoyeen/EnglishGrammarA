import { WordLookupError, wordRequestSchema, wordResultSchema, type WordRequest, type WordResult } from "@/domain/word";
import { lookupDictionary, type DictionaryLookup } from "@/server/wordDictionary";
import { selectWord, wordSelectionSchema, type WordSelector } from "@/server/wordModel";

function untilCancelled<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

export async function lookupWord(request: WordRequest, callerSignal?: AbortSignal, dependencies: {
  dictionary?: DictionaryLookup; select?: WordSelector; timeoutMs?: number;
} = {}): Promise<WordResult> {
  if (!wordRequestSchema.safeParse(request).success) throw new WordLookupError("INVALID_WORD");
  if (callerSignal?.aborted) throw new WordLookupError("REQUEST_CANCELLED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("deadline")), dependencies.timeoutMs ?? 15_000);
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const dictionaryController = new AbortController();
  const dictionaryTimeout = setTimeout(() => dictionaryController.abort(), 5_000);
  try {
    const dictionarySignal = AbortSignal.any([signal, dictionaryController.signal]);
    const dictionary = await untilCancelled((dependencies.dictionary ?? lookupDictionary)(request.word, dictionarySignal), dictionarySignal).catch(() => null);
    clearTimeout(dictionaryTimeout);
    signal.throwIfAborted();
    const raw = await untilCancelled((dependencies.select ?? selectWord)({ ...request, dictionary }, signal), signal);
    const selected = wordSelectionSchema.parse(raw);
    if (selected.status === "unknown") throw new WordLookupError("UNKNOWN_WORD");
    const candidate = dictionary?.entries.flatMap(entry => entry.pronunciations).find(p => p.id === selected.pronunciationId);
    const accent = candidate?.tags.some(tag => /^(UK|Received Pronunciation|British English)$/i.test(tag)) ? "UK"
      : candidate?.tags.some(tag => /^(US|General American|American English)$/i.test(tag)) ? "US" : null;
    return wordResultSchema.parse({
      word: request.word, start: request.start, end: request.end, meaning: selected.meaning,
      lemma: selected.lemma === request.word ? null : selected.lemma,
      phonetic: candidate ? { text: candidate.text, accent } : null,
      source: dictionary?.entries.length ? dictionary.source : null,
    });
  } catch (error) {
    if (callerSignal?.aborted) throw new WordLookupError("REQUEST_CANCELLED");
    if (controller.signal.aborted) throw new WordLookupError("LOOKUP_TIMEOUT");
    if (error instanceof WordLookupError) throw error;
    throw new WordLookupError("LOOKUP_FAILED");
  } finally { clearTimeout(timeout); clearTimeout(dictionaryTimeout); }
}
