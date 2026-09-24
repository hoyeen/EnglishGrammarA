"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { SentenceAnalyzer } from "@/components/SentenceAnalyzer";
import { PhraseTranslator } from "@/components/PhraseTranslator";

const modes = ["sentence", "translation"] as const;
type Mode = typeof modes[number];

export function StudyTabs() {
  const [mode, setMode] = useState<Mode>("sentence");
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % modes.length
      : event.key === "ArrowLeft" ? (index + modes.length - 1) % modes.length
      : event.key === "Home" ? 0 : event.key === "End" ? modes.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setMode(modes[next]);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div className="study-tabs" role="tablist" aria-label="学习工具">
        {modes.map((item, index) => <button
          key={item}
          ref={element => { refs.current[index] = element; }}
          className={`study-tab${mode === item ? " study-tab--active" : ""}`}
          type="button"
          role="tab"
          id={`tab-${item}`}
          aria-controls={`panel-${item}`}
          aria-selected={mode === item}
          tabIndex={mode === item ? 0 : -1}
          onClick={() => setMode(item)}
          onKeyDown={event => onKeyDown(event, index)}
        >{item === "sentence" ? "句子分析" : "单词／短语翻译"}</button>)}
      </div>
      <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
        {mode === "sentence" ? <SentenceAnalyzer /> : <PhraseTranslator />}
      </div>
    </div>
  );
}
