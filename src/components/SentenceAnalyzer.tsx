"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { analysisResultSchema, type AnalysisResult } from "@/domain/analysis";
import { MAX_SENTENCE_LENGTH, validateSentenceInput } from "@/domain/input";
import { GrammarLegend } from "@/components/GrammarLegend";
import { HighlightedSentence } from "@/components/HighlightedSentence";

const FALLBACK_ERROR = "分析失败，请重试。";

function readErrorMessage(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return FALLBACK_ERROR;
}

export function SentenceAnalyzer() {
  const [sentence, setSentence] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestInFlight = useRef(false);
  const currentRequestId = useRef(0);
  const excessCharacters = Math.max(0, sentence.length - MAX_SENTENCE_LENGTH);

  useEffect(() => () => {
    currentRequestId.current += 1;
    requestInFlight.current = false;
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (requestInFlight.current || excessCharacters > 0) return;

    const validation = validateSentenceInput(sentence);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    requestInFlight.current = true;
    const requestId = ++currentRequestId.current;
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence: validation.value }),
      });
      const body: unknown = await response.json();

      if (!response.ok) throw new Error(readErrorMessage(body));

      const parsed = analysisResultSchema.safeParse(body);
      if (!parsed.success || parsed.data.original !== validation.value) {
        throw new Error(FALLBACK_ERROR);
      }
      if (requestId === currentRequestId.current) setResult(parsed.data);
    } catch (cause) {
      if (requestId === currentRequestId.current) {
        setError(cause instanceof Error ? cause.message : FALLBACK_ERROR);
      }
    } finally {
      if (requestId === currentRequestId.current) {
        requestInFlight.current = false;
        setLoading(false);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (requestInFlight.current || excessCharacters > 0) return;
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="analyzer" aria-label="英文句子分析器">
      <form className="input-card" onSubmit={submit}>
        <label className="sr-only" htmlFor="sentence">
          英文句子
        </label>
        <textarea
          id="sentence"
          disabled={loading}
          aria-describedby={excessCharacters > 0 ? "sentence-count sentence-length-error" : "sentence-count"}
          aria-invalid={excessCharacters > 0}
          value={sentence}
          onChange={(event) => {
            setSentence(event.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="例如：The book that I bought yesterday is interesting."
          spellCheck="false"
        />
        <div className="input-card__footer">
          <div className="input-hint">
            <span id="sentence-count" role="status" aria-live="polite" aria-atomic="true">
              {sentence.length} / {MAX_SENTENCE_LENGTH}
            </span>
            <span className="shortcut">Ctrl + Enter 快速提交</span>
          </div>
          <button className="primary-button" disabled={loading || excessCharacters > 0} type="submit">
            <span>{loading ? "分析中…" : "分析句子"}</span>
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </form>

      {excessCharacters > 0 && (
        <p id="sentence-length-error" className="error-message" role="alert">
          超出 {excessCharacters} 个字符，请缩短后再分析。
        </p>
      )}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <div className="result-skeleton" aria-label="正在分析" aria-live="polite">
          <span className="skeleton skeleton--short" />
          <span className="skeleton skeleton--sentence" />
          <span className="skeleton skeleton--divider" />
          <span className="skeleton skeleton--translation" />
        </div>
      )}

      {result && (
        <article className="result-card" aria-live="polite">
          <div className="result-card__header">
            <div>
              <p className="section-kicker">句子结构</p>
              <p className="section-note">按各成分在整句中的整体作用标注</p>
            </div>
            <GrammarLegend />
          </div>
          <HighlightedSentence result={result} />
          <section className="translation-block">
            <h2 className="section-kicker">自然中文翻译</h2>
            <p className="translation">{result.translation}</p>
          </section>
        </article>
      )}
    </section>
  );
}
