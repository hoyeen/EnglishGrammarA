import type { ReactNode } from "react";
import type { AnalysisResult } from "@/domain/analysis";
import { tokenizeWords, type WordToken } from "@/domain/word";

export function HighlightedSentence({ result, onWord, activeStart, popoverId }: {
  result: AnalysisResult;
  onWord?: (word: WordToken, anchor: HTMLButtonElement) => void;
  activeStart?: number;
  popoverId?: string;
}) {
  if (onWord) {
    const renderRange = (start: number, end: number) => {
      const pieces: ReactNode[] = [];
      let cursor = start;
      for (const segment of result.segments) {
        const left = Math.max(start, segment.start);
        const right = Math.min(end, segment.end);
        if (left >= right) continue;
        if (left > cursor) pieces.push(<span className="segment--neutral" key={`gap-${cursor}`}>{result.original.slice(cursor, left)}</span>);
        pieces.push(<span className={`segment segment--${segment.type}`} key={`color-${left}`}>{result.original.slice(left, right)}</span>);
        cursor = right;
      }
      if (cursor < end) pieces.push(<span className="segment--neutral" key={`tail-${cursor}`}>{result.original.slice(cursor, end)}</span>);
      return pieces;
    };
    const pieces: ReactNode[] = [];
    let cursor = 0;
    for (const token of tokenizeWords(result.original)) {
      if (token.start > cursor) pieces.push(<span key={`gap-${cursor}`}>{renderRange(cursor, token.start)}</span>);
      pieces.push(
        <button type="button" className="word-button" key={token.start} data-word-start={token.start}
          aria-label={`查询 ${token.word}`} aria-haspopup="dialog" aria-expanded={activeStart === token.start}
          aria-controls={activeStart === token.start ? popoverId : undefined}
          onClick={event => onWord(token, event.currentTarget)}>
          {renderRange(token.start, token.end)}
        </button>,
      );
      cursor = token.end;
    }
    if (cursor < result.original.length) pieces.push(<span key="tail">{renderRange(cursor, result.original.length)}</span>);
    return <div className="highlighted-sentence highlighted-sentence--interactive" data-testid="highlighted-sentence">{pieces}</div>;
  }
  const pieces: ReactNode[] = [];
  let cursor = 0;

  result.segments.forEach((segment, index) => {
    if (segment.start > cursor) {
      pieces.push(
        <span className="segment--neutral" key={`gap-${index}`}>
          {result.original.slice(cursor, segment.start)}
        </span>,
      );
    }

    pieces.push(
      <span
        className={`segment segment--${segment.type}`}
        key={`segment-${index}`}
      >
        {result.original.slice(segment.start, segment.end)}
      </span>,
    );
    cursor = segment.end;
  });

  if (cursor < result.original.length) {
    pieces.push(
      <span className="segment--neutral" key="tail">
        {result.original.slice(cursor)}
      </span>,
    );
  }

  return (
    <div className="highlighted-sentence" data-testid="highlighted-sentence">
      {pieces}
    </div>
  );
}
