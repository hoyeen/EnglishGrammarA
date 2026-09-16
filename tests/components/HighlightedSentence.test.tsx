import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GrammarLegend } from "@/components/GrammarLegend";
import { HighlightedSentence } from "@/components/HighlightedSentence";

it("renders the exact original text and leaves gaps neutral", () => {
  const original = "The book is interesting.";
  const { container } = render(
    <HighlightedSentence
      result={{
        original,
        segments: [
          { start: 0, end: 8, type: "noun" },
          { start: 9, end: 11, type: "verb" },
          { start: 12, end: 23, type: "adjective" },
        ],
        translation: "这本书很有意思。",
      }}
    />,
  );

  expect(container.textContent).toBe(original);
  expect(screen.getByText(".")).toHaveClass("segment--neutral");
  expect(screen.getByText("The book")).toHaveClass("segment--noun");
});

it("renders all four grammar labels as text", () => {
  render(<GrammarLegend />);

  for (const label of ["名词性", "形容词性", "副词性", "动词"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});
