"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { analysisResultSchema, type AnalysisResult } from "@/domain/analysis";
import { validateSentenceInput } from "@/domain/input";
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateSentenceInput(sentence);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

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
      setResult(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : FALLBACK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
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
          maxLength={500}
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
            <span>{sentence.length} / 500</span>
            <span className="shortcut">Ctrl + Enter 快速提交</span>
          </div>
          <button className="primary-button" disabled={loading} type="submit">
            <span>{loading ? "分析中…" : "分析句子"}</span>
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </form>

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
