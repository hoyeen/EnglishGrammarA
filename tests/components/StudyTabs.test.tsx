import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { StudyTabs } from "@/components/StudyTabs";

it("switches between sentence analysis and word or phrase translation", async () => {
  render(<StudyTabs />);
  expect(screen.getByRole("tab", { name: "句子分析" })).toHaveAttribute("aria-selected", "true");
  await userEvent.click(screen.getByRole("tab", { name: "单词／短语翻译" }));
  expect(screen.getByLabelText("输入英文单词或短语")).toBeInTheDocument();
  await userEvent.keyboard("{ArrowLeft}");
  expect(screen.getByLabelText("英文句子")).toBeInTheDocument();
});
