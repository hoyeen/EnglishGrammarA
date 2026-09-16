import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SentenceAnalyzer } from "@/components/SentenceAnalyzer";

const firstResult = {
  original: "She left.",
  segments: [
    { start: 0, end: 3, type: "noun" },
    { start: 4, end: 8, type: "verb" },
  ],
  translation: "她离开了。",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows a local error without making a request for empty input", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);

  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(screen.getByRole("alert")).toHaveTextContent("请先输入一个英文句子。");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("disables duplicate submission while loading", async () => {
  let resolveRequest: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    ),
  );
  render(<SentenceAnalyzer />);

  await userEvent.type(screen.getByLabelText("英文句子"), "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(screen.getByRole("button", { name: "分析中…" })).toBeDisabled();
  resolveRequest?.(
    new Response(JSON.stringify(firstResult), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
});

it("submits one sentence and renders the exact original with its translation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(firstResult), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  render(<SentenceAnalyzer />);

  await userEvent.type(screen.getByLabelText("英文句子"), "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
  expect(screen.getByTestId("highlighted-sentence")).toHaveTextContent("She left.");
  expect(screen.getByText("She")).toHaveClass("segment--noun");
});

it("preserves input and shows the server message after a failed request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "ANALYSIS_FAILED", message: "分析失败，请重试。" }),
        { status: 502, headers: { "content-type": "application/json" } },
      ),
    ),
  );
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子");

  await userEvent.type(input, "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("分析失败，请重试。");
  expect(input).toHaveValue("She left.");
});

it("rejects malformed successful responses instead of rendering them", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...firstResult, segments: [{ start: 9, end: 2, type: "noun" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  render(<SentenceAnalyzer />);

  await userEvent.type(screen.getByLabelText("英文句子"), "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("分析失败，请重试。");
  expect(screen.queryByText("她离开了。")).not.toBeInTheDocument();
});

it("replaces the first result with the second analysis", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(firstResult), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          original: "They stayed.",
          segments: [
            { start: 0, end: 4, type: "noun" },
            { start: 5, end: 11, type: "verb" },
          ],
          translation: "他们留下了。",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子");

  await userEvent.type(input, "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();

  await userEvent.clear(input);
  await userEvent.type(input, "They stayed.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));

  expect(await screen.findByText("他们留下了。")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("她离开了。")).not.toBeInTheDocument());
});
