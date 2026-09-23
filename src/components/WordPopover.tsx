"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { WordResult, WordToken } from "@/domain/word";
import { WordPronunciation } from "@/components/WordPronunciation";

export interface WordPopoverState {
  token: WordToken;
  anchor: HTMLButtonElement;
  loading: boolean;
  result?: WordResult;
  error?: string;
  retryable: boolean;
}

export function WordPopover({ id, state, sentenceRef, onClose, onRetry }: {
  id: string; state: WordPopoverState; sentenceRef: RefObject<HTMLDivElement | null>;
  onClose: (restoreFocus?: boolean) => void; onRetry: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const position = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const anchor = state.anchor.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(80, height - 24)}px`;
      panel.style.width = `${Math.min(320, width - 24)}px`;
      const rect = panel.getBoundingClientRect();
      const left = Math.max(offsetLeft + 12, Math.min(anchor.left, offsetLeft + width - rect.width - 12));
      const below = anchor.bottom + 10;
      const top = below + rect.height <= offsetTop + height - 12 ? below : anchor.top - rect.height - 10;
      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(offsetTop + 12, Math.min(top, offsetTop + height - rect.height - 12))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(panel);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [state.anchor, state.loading, state.error, state.result]);

  useLayoutEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, [state.anchor]);

  useLayoutEffect(() => {
    if (state.loading) {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [state.loading]);

  useLayoutEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return;
      // Other words handle switching in their own click event.
      if (target instanceof Element && target.closest("[data-word-start]") && sentenceRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener("keydown", keyDown);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", keyDown); document.removeEventListener("pointerdown", outside); };
  }, [onClose, sentenceRef]);

  return createPortal(
    <div ref={panelRef} id={id} className="word-popover" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="word-popover__header">
        <h2 id={`${id}-title`}>{state.token.word}</h2>
        <button type="button" className="word-popover__close" aria-label="关闭查词" onClick={() => onClose()}>×</button>
      </div>
      <WordPronunciation key={JSON.stringify(state.token)} word={state.token.word} />
      <div aria-live="polite" aria-atomic="true" className="word-popover__body">
        {state.loading && <p className="word-popover__muted" role="status">正在查询…</p>}
        {state.error && <p className="word-popover__error" role="alert">{state.error}</p>}
        {state.result && <>
          <p className="word-popover__phonetic">{state.result.phonetic
            ? <>{state.result.phonetic.accent === "UK" ? "英 " : state.result.phonetic.accent === "US" ? "美 " : "音标 "}{state.result.phonetic.text}</>
            : <span className="word-popover__muted">暂无可靠音标</span>}</p>
          <p className="word-popover__label">本句释义</p>
          <p className="word-popover__meaning">{state.result.meaning}</p>
          {state.result.lemma && <p className="word-popover__muted">原形：{state.result.lemma}</p>}
        </>}
      </div>
      {!state.loading && state.retryable && <button type="button" className="word-popover__retry" onClick={onRetry}>重试</button>}
      {state.result?.source && <p className="word-popover__source">
        <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener noreferrer">FreeDictionaryAPI.com</a>
        {" · "}<a href={state.result.source.url} target="_blank" rel="noopener noreferrer">Wiktionary 词条</a>
        {" · "}<a href={state.result.source.license.url} target="_blank" rel="noopener noreferrer">{state.result.source.license.name}</a>
      </p>}
    </div>, document.body,
  );
}
