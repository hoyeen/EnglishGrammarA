import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function successfulResponse(original = firstResult.original) {
  return new Response(JSON.stringify({ ...firstResult, original }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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

it("locks synchronous form submissions before React updates the button", async () => {
  const request = deferredResponse();
  const fetchMock = vi.fn(() => request.promise);
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子") as HTMLTextAreaElement;
  await userEvent.type(input, "She left.");

  act(() => {
    input.form!.requestSubmit();
    input.form!.requestSubmit();
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(input).toBeDisabled();
  await act(async () => request.resolve(successfulResponse()));
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
  expect(input).toBeEnabled();
});

it.each([
  ["Control", "ctrlKey"],
  ["Meta", "metaKey"],
] as const)("blocks repeated %s+Enter, clicks and form submission while pending", async (modifier, key) => {
  const user = userEvent.setup();
  const request = deferredResponse();
  const fetchMock = vi.fn(() => request.promise);
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子") as HTMLTextAreaElement;
  await user.type(input, "She left.");
  await user.keyboard(`{${modifier}>}{Enter}{/${modifier}}`);

  await user.keyboard(`{${modifier}>}{Enter}{Enter}{/${modifier}}`);
  fireEvent.keyDown(input, { key: "Enter", [key]: true });
  await user.click(screen.getByRole("button", { name: "分析中…" }));
  act(() => input.form!.requestSubmit());

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(input).toBeDisabled();
  await user.type(input, " They stayed.");
  expect(input).toHaveValue("She left.");
  await act(async () => request.resolve(successfulResponse()));
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
  expect(input).toBeEnabled();
  expect(screen.getByRole("button", { name: "分析句子" })).toBeEnabled();
});

it.each([499, 500])("keeps and submits a %i-character paste", async (length) => {
  const user = userEvent.setup();
  const sentence = "A".repeat(length - 1) + ".";
  const fetchMock = vi.fn().mockResolvedValue(successfulResponse(sentence));
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子");
  await user.click(input);
  await user.paste(sentence);

  expect(input).toHaveValue(sentence);
  expect(screen.getByRole("status")).toHaveTextContent(`${length} / 500`);
  expect(screen.getByRole("button", { name: "分析句子" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "分析句子" }));
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sentence });
});

it("retains a 501-character paste, blocks every submit path and recovers after shortening", async () => {
  const user = userEvent.setup();
  const sentence = "A".repeat(500) + ".";
  const fetchMock = vi.fn().mockResolvedValue(successfulResponse(sentence.slice(0, 500)));
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子") as HTMLTextAreaElement;
  await user.click(input);
  await user.paste(sentence);

  expect(input).toHaveValue(sentence);
  expect(screen.getByRole("status")).toHaveTextContent("501 / 500");
  expect(input).toHaveAccessibleDescription(/超出 1 个字符，请缩短后再分析。/);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "分析句子" })).toBeDisabled();
  await user.keyboard("{Control>}{Enter}{/Control}{Meta>}{Enter}{/Meta}");
  act(() => input.form!.requestSubmit());
  expect(fetchMock).not.toHaveBeenCalled();

  await user.keyboard("{End}{Backspace}");
  expect(input).toHaveValue(sentence.slice(0, 500));
  expect(screen.queryByText("超出 1 个字符，请缩短后再分析。")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "分析句子" })).toBeEnabled();
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("counts outer whitespace towards the input limit", async () => {
  const user = userEvent.setup();
  const sentence = " " + "A".repeat(499) + ". ";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<SentenceAnalyzer />);
  const input = screen.getByLabelText("英文句子") as HTMLTextAreaElement;
  await user.click(input);
  await user.paste(sentence);

  expect(input).toHaveValue(sentence);
  expect(screen.getByRole("status")).toHaveTextContent("502 / 500");
  expect(input).toHaveAccessibleDescription(/超出 2 个字符，请缩短后再分析。/);
  expect(screen.getByRole("button", { name: "分析句子" })).toBeDisabled();
  act(() => input.form!.requestSubmit());
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["server", "network", "json", "schema"])(
  "restores editable input after a %s failure and allows a new successful request",
  async (failure) => {
    const user = userEvent.setup();
    const request = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(request.promise)
      .mockResolvedValueOnce(successfulResponse("They stayed."));
    vi.stubGlobal("fetch", fetchMock);
    render(<SentenceAnalyzer />);
    const input = screen.getByLabelText("英文句子");
    await user.type(input, "She left.");
    await user.click(screen.getByRole("button", { name: "分析句子" }));
    expect(input).toBeDisabled();

    await act(async () => {
      if (failure === "network") {
        request.reject(new Error("网络连接失败"));
      } else if (failure === "json") {
        request.resolve(new Response("invalid JSON", { status: 200 }));
      } else if (failure === "schema") {
        request.resolve(new Response("{}", { status: 200 }));
      } else {
        request.resolve(new Response(JSON.stringify({ message: "分析失败，请重试。" }), { status: 502 }));
      }
    });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(input).toHaveValue("She left.");
    expect(screen.getByRole("button", { name: "分析句子" })).toBeEnabled();
    await user.clear(input);
    await user.type(input, "They stayed.");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(await screen.findByText("她离开了。")).toBeInTheDocument();
    expect(screen.getByTestId("highlighted-sentence")).toHaveTextContent("They stayed.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(input).toBeEnabled();
  },
);

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
