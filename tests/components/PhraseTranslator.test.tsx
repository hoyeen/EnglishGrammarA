import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PhraseTranslator } from "@/components/PhraseTranslator";

afterEach(() => vi.unstubAllGlobals());

it("submits a phrase and renders the model translation", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ original: "take off", meanings: ["起飞", "脱下"] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<PhraseTranslator />);
  await userEvent.type(screen.getByLabelText("输入英文单词或短语"), "take off");
  await userEvent.click(screen.getByRole("button", { name: "翻译" }));
  expect(await screen.findByText("起飞")).toBeInTheDocument();
  expect(screen.getByText("脱下")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/translate", expect.objectContaining({ method: "POST" }));
  await userEvent.type(screen.getByLabelText("输入英文单词或短语"), " now");
  expect(screen.queryByText("起飞")).not.toBeInTheDocument();
});

it("rejects empty input locally and displays provider errors", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: "UNKNOWN", message: "暂时无法确定这个词或短语的含义。" }, { status: 422 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<PhraseTranslator />);
  await userEvent.click(screen.getByRole("button", { name: "翻译" }));
  expect(screen.getByRole("alert")).toHaveTextContent("请输入英文单词或短语。");
  expect(fetchMock).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("输入英文单词或短语"), "xyzzy");
  await userEvent.click(screen.getByRole("button", { name: "翻译" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法确定");
});
