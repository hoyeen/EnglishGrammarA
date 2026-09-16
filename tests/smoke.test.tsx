import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("shows the sentence analyzer heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "粘贴一个看不懂的英文长句" }),
    ).toBeInTheDocument();
  });
});
