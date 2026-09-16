import type { ReactNode } from "react";
import type { AnalysisResult } from "@/domain/analysis";

export function HighlightedSentence({ result }: { result: AnalysisResult }) {
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

  return <div className="highlighted-sentence">{pieces}</div>;
}
