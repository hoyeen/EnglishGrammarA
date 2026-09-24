"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_TRANSLATION_LENGTH, translationResultSchema, validateTranslationInput, type TranslationResult } from "@/domain/translation";

function errorMessage(value: unknown) {
  return value && typeof value === "object" && "message" in value && typeof value.message === "string"
    ? value.message : "翻译失败，请重试。";
}

export function PhraseTranslator() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const excess = Math.max(0, text.length - MAX_TRANSLATION_LENGTH);

  useEffect(() => () => controller.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current || excess > 0) return;
    const validation = validateTranslationInput(text);
    if (!validation.ok) { setError(validation.message); return; }

    const current = new AbortController();
    controller.current = current;
    setResult(null);
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: validation.value }),
        signal: current.signal,
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const parsed = translationResultSchema.safeParse(body);
      if (!parsed.success || parsed.data.original !== validation.value) throw new Error("翻译失败，请重试。");
      if (!current.signal.aborted) setResult(parsed.data);
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "翻译失败，请重试。");
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <section className="analyzer" aria-label="单词和短语翻译器">
    <form className="input-card" onSubmit={submit}>
      <label className="translation-label" htmlFor="translation-input">输入英文单词或短语</label>
      <textarea id="translation-input" className="translation-input" value={text} disabled={loading}
        aria-describedby={excess ? "translation-count translation-length-error" : "translation-count"}
        aria-invalid={excess > 0}
        placeholder="例如：take off" spellCheck="false" onKeyDown={onKeyDown}
        onChange={event => { setText(event.target.value); setResult(null); setError(""); }} />
      <div className="input-card__footer">
        <div className="input-hint">
          <span id="translation-count" role="status" aria-live="polite">{text.length} / {MAX_TRANSLATION_LENGTH}</span>
          <span className="shortcut">Ctrl + Enter 快速提交</span>
        </div>
        <button className="primary-button" disabled={loading || excess > 0} type="submit">
          <span>{loading ? "翻译中…" : "翻译"}</span>
          {!loading && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </form>
    {excess > 0 && <p id="translation-length-error" className="error-message" role="alert">超出 {excess} 个字符，请缩短后再翻译。</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading && <div className="result-skeleton" aria-label="正在翻译" aria-live="polite"><span className="skeleton skeleton--short" /><span className="skeleton skeleton--translation" /></div>}
    {result && <article className="result-card translation-result" aria-live="polite">
      <h2 className="section-kicker">中文译法</h2>
      <p className="translation">{result.meanings[0]}</p>
      {result.meanings.length > 1 && <div className="translation-alternatives">
        <p className="section-note">其他常见译法</p>
        <ul>{result.meanings.slice(1).map(meaning => <li key={meaning}>{meaning}</li>)}</ul>
      </div>}
    </article>}
  </section>;
}
