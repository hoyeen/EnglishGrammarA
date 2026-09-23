import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WordSentence } from "@/components/WordSentence";
import { WordLookupClient } from "@/client/wordLookup";
import type { AnalysisResult } from "@/domain/analysis";

const result: AnalysisResult = { original: "I saw a saw.", translation: "我看见一把锯子。", segments: [{ start: 0, end: 1, type: "noun" }, { start: 2, end: 5, type: "verb" }, { start: 6, end: 11, type: "noun" }] };
const reply = (start: number) => ({ word: "saw", start, end: start + 3, meaning: start === 2 ? "看见" : "锯子", lemma: null, phonetic: null, source: null });

it("opens by keyboard, restores focus on Escape, caches and preserves original text", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(reply(2))));
  render(<WordSentence result={result} client={new WordLookupClient(fetcher)} />);
  const word = screen.getAllByRole("button", { name: "查询 saw" })[0];
  word.focus(); await user.keyboard("{Enter}");
  expect(await screen.findByText("看见")).toBeInTheDocument();
  expect(screen.getByText("暂无可靠音标")).toBeInTheDocument();
  expect(screen.getByTestId("highlighted-sentence").textContent).toBe(result.original);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(word).toHaveFocus();
  await user.keyboard(" ");
  expect(await screen.findByText("看见")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("queries a whole word even when a color boundary falls inside it", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(reply(2)));
  render(<WordSentence result={{ ...result, segments: [{ start: 2, end: 3, type: "noun" }, { start: 3, end: 5, type: "verb" }] }} client={new WordLookupClient(fetcher)} />);
  await userEvent.click(screen.getAllByRole("button", { name: "查询 saw" })[0]);
  await screen.findByText("看见");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ sentence: result.original, word: "saw", start: 2, end: 5 });
  expect(screen.getByTestId("highlighted-sentence").textContent).toBe(result.original);
});

it("does not let stale A overwrite B or reopen a closed popover", async () => {
  const resolve: Array<(value: Response) => void> = [];
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(done => resolve.push(done)));
  render(<WordSentence result={result} client={new WordLookupClient(fetcher)} />);
  const words = screen.getAllByRole("button", { name: "查询 saw" });
  fireEvent.click(words[0]); fireEvent.click(words[1]);
  await act(async () => { resolve[1](Response.json(reply(8))); });
  expect(screen.getByText("锯子")).toBeInTheDocument();
  await act(async () => { resolve[0](Response.json(reply(2))); });
  expect(screen.queryByText("看见")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "关闭查词" }));
  fireEvent.click(words[0]); fireEvent.pointerDown(document.body);
  await act(async () => { resolve[2](Response.json(reply(2))); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("invalidates pending lookup on unmount and permits retry after an error", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  const view = render(<WordSentence result={result} client={new WordLookupClient(fetcher)} />);
  fireEvent.click(screen.getAllByRole("button", { name: "查询 saw" })[0]);
  view.unmount();
  await act(async () => resolve(Response.json(reply(2))));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const failure = vi.fn().mockResolvedValueOnce(Response.json({ code: "LOOKUP_TIMEOUT" }, { status: 504 })).mockResolvedValueOnce(Response.json(reply(2)));
  render(<WordSentence result={result} client={new WordLookupClient(failure)} />);
  await userEvent.click(screen.getAllByRole("button", { name: "查询 saw" })[0]);
  expect(await screen.findByText("查词超时，请重试。")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("看见")).toBeInTheDocument();
});

it("shows an unsupported message for a long word without querying", async () => {
  const word = "a".repeat(81);
  const fetcher = vi.fn();
  render(<WordSentence result={{ original: `${word}.`, segments: [], translation: "" }} client={new WordLookupClient(fetcher)} />);
  await userEvent.click(screen.getByRole("button", { name: `查询 ${word}` }));
  expect(await screen.findByText("暂不支持查询超过 80 个字符的单词。")).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps keyboard focus inside the popover when retry replaces its button", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ code: "LOOKUP_FAILED" }, { status: 502 })).mockImplementation(() => new Promise(() => {}));
  render(<WordSentence result={result} client={new WordLookupClient(fetcher)} />);
  await userEvent.click(screen.getAllByRole("button", { name: "查询 saw" })[0]);
  const retry = await screen.findByRole("button", { name: "重试" });
  retry.focus(); await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toHaveFocus();
});

it("does not steal focus when a lookup finishes after the user tabs away", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  render(<><WordSentence result={result} client={new WordLookupClient(fetcher)} /><button>继续阅读</button></>);
  await userEvent.click(screen.getAllByRole("button", { name: "查询 saw" })[0]);
  expect(screen.getByRole("dialog")).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(screen.getByRole("button", { name: "继续阅读" })).toHaveFocus();
  await act(async () => resolve(Response.json(reply(2))));
  expect(screen.getByText("看见")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "继续阅读" })).toHaveFocus();
});
