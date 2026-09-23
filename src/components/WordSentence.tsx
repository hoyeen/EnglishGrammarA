"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AnalysisResult } from "@/domain/analysis";
import { MAX_WORD_LENGTH, WordLookupError, type WordToken } from "@/domain/word";
import { WordLookupClient } from "@/client/wordLookup";
import { HighlightedSentence } from "@/components/HighlightedSentence";
import { WordPopover, type WordPopoverState } from "@/components/WordPopover";

// Key the interactive subtree by result so replacement synchronously discards old UI.
export function WordSentence({ result, client }: { result: AnalysisResult; client: WordLookupClient }) {
  return <InteractiveSentence key={JSON.stringify(result)} result={result} client={client} />;
}

function InteractiveSentence({ result, client }: { result: AnalysisResult; client: WordLookupClient }) {
  const [selection, setSelection] = useState<WordPopoverState | null>(null);
  const active = useRef<{ id: number; controller: AbortController; anchor: HTMLButtonElement } | null>(null);
  const sequence = useRef(0);
  const sentenceRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const close = useCallback((restoreFocus = true) => {
    const previous = active.current;
    active.current = null;
    sequence.current += 1;
    previous?.controller.abort();
    setSelection(null);
    if (restoreFocus && previous?.anchor.isConnected) previous.anchor.focus({ preventScroll: true });
  }, []);

  useEffect(() => () => {
    sequence.current += 1;
    active.current?.controller.abort();
    active.current = null;
  }, []);

  async function open(token: WordToken, anchor: HTMLButtonElement, force = false) {
    if (!force && active.current?.anchor === anchor && selection?.loading) return;
    active.current?.controller.abort();
    const controller = new AbortController();
    const id = ++sequence.current;
    active.current = { id, controller, anchor };
    const state = { token, anchor, loading: true, retryable: false };
    setSelection(state);
    if (token.word.length > MAX_WORD_LENGTH) {
      setSelection({ ...state, loading: false, error: new WordLookupError("WORD_TOO_LONG").message });
      return;
    }
    try {
      const answer = await client.lookup({ ...token, sentence: result.original }, controller.signal, force);
      if (sequence.current === id && !controller.signal.aborted) {
        setSelection({ ...state, loading: false, result: answer, retryable: answer.phonetic === null });
      }
    } catch (error) {
      if (sequence.current === id && !controller.signal.aborted) {
        setSelection({ ...state, loading: false, error: error instanceof WordLookupError ? error.message : "查词失败，请重试。", retryable: true });
      }
    }
  }

  return <div ref={sentenceRef}>
    <HighlightedSentence result={result} onWord={(token, anchor) => { void open(token, anchor); }} activeStart={selection?.token.start} popoverId={popoverId} />
    <p className="word-lookup-hint">点击单词，查看本句释义与音标</p>
    {selection && <WordPopover id={popoverId} state={selection} sentenceRef={sentenceRef} onClose={close}
      onRetry={() => { void open(selection.token, selection.anchor, true); }} />}
  </div>;
}
