import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("shows both learning tools", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "看懂英文，从句子到短语" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "句子分析" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "单词／短语翻译" })).toBeInTheDocument();
  });
});
