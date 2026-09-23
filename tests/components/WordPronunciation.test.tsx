import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WordPronunciation } from "@/components/WordPronunciation";

interface MockVoice {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
}

class MockSpeechSynthesisUtterance {
  text: string;
  lang = "";
  voice: MockVoice | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;

  constructor(text = "") {
    this.text = text;
  }
}

function makeVoice(lang: string, name: string): MockVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

describe("WordPronunciation", () => {
  let mockSynthesis: {
    cancel: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
    getVoices: ReturnType<typeof vi.fn>;
    speaking: boolean;
    paused: boolean;
    pending: boolean;
  };

  beforeEach(() => {
    mockSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn<() => MockVoice[]>(() => []),
      speaking: false,
      paused: false,
      pending: false,
    };
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    vi.stubGlobal("speechSynthesis", mockSynthesis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not play automatically on mount and renders manual play button", () => {
    render(<WordPronunciation word="saw" />);

    expect(screen.getByRole("button", { name: "发音" })).toBeInTheDocument();
    expect(screen.getByText("发音不保证匹配上下文音标")).toBeInTheDocument();
    expect(mockSynthesis.speak).not.toHaveBeenCalled();
    expect(mockSynthesis.cancel).not.toHaveBeenCalled();
  });

  it("handles manual play by clearing queue and speaking the word", async () => {
    const user = userEvent.setup();
    render(<WordPronunciation word="saw" />);

    await user.click(screen.getByRole("button", { name: "发音" }));

    expect(mockSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(mockSynthesis.speak).toHaveBeenCalledTimes(1);
    const utterance = mockSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.text).toBe("saw");
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
  });

  it("prefers British English voice, falls back to other English, or en-GB when voices are empty", async () => {
    const user = userEvent.setup();
    const ukVoice = makeVoice("en-GB", "Daniel");
    const usVoice = makeVoice("en-US", "Samantha");
    const zhVoice = makeVoice("zh-CN", "Ting-Ting");

    // Case 1: Has UK voice
    mockSynthesis.getVoices.mockReturnValue([zhVoice, usVoice, ukVoice]);
    const { unmount } = render(<WordPronunciation word="saw" />);
    await user.click(screen.getByRole("button", { name: "发音" }));
    let utterance = mockSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.voice).toEqual(ukVoice);
    expect(utterance.lang).toBe("en-GB");
    unmount();

    // Case 2: Only non-UK English voice
    mockSynthesis.speak.mockClear();
    mockSynthesis.getVoices.mockReturnValue([zhVoice, usVoice]);
    const { unmount: unmount2 } = render(<WordPronunciation word="saw" />);
    await user.click(screen.getByRole("button", { name: "发音" }));
    utterance = mockSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.voice).toEqual(usVoice);
    expect(utterance.lang).toBe("en-US");
    unmount2();

    // Case 3: Empty voices list
    mockSynthesis.speak.mockClear();
    mockSynthesis.getVoices.mockReturnValue([]);
    render(<WordPronunciation word="saw" />);
    await user.click(screen.getByRole("button", { name: "发音" }));
    utterance = mockSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.voice).toBeNull();
    expect(utterance.lang).toBe("en-GB");
  });

  it("allows stopping playback manually and resets state on end or error", async () => {
    const user = userEvent.setup();
    render(<WordPronunciation word="saw" />);

    // Stop manually
    await user.click(screen.getByRole("button", { name: "发音" }));
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "停止" }));
    expect(mockSynthesis.cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "发音" })).toBeInTheDocument();

    // Reset on end event
    await user.click(screen.getByRole("button", { name: "发音" }));
    let utterance = mockSynthesis.speak.mock.calls[1][0] as MockSpeechSynthesisUtterance;
    act(() => {
      utterance.onend?.(new Event("end"));
    });
    expect(screen.getByRole("button", { name: "发音" })).toBeInTheDocument();

    // Reset on error event
    await user.click(screen.getByRole("button", { name: "发音" }));
    utterance = mockSynthesis.speak.mock.calls[2][0] as MockSpeechSynthesisUtterance;
    act(() => {
      utterance.onerror?.(new Event("error"));
    });
    expect(screen.getByRole("button", { name: "发音" })).toBeInTheDocument();
  });

  it("cancels and resets after 15 seconds if no end event is fired", () => {
    vi.useFakeTimers();
    render(<WordPronunciation word="saw" />);

    fireEvent.click(screen.getByRole("button", { name: "发音" }));
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(14999);
    });
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockSynthesis.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "发音" })).toBeInTheDocument();
  });

  it("cancels speech and timers when unmounted", () => {
    vi.useFakeTimers();
    const { unmount } = render(<WordPronunciation word="saw" />);

    fireEvent.click(screen.getByRole("button", { name: "发音" }));
    mockSynthesis.cancel.mockClear();

    unmount();
    expect(mockSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores stale callbacks from previous utterances", () => {
    render(<WordPronunciation word="saw" />);

    // First playback
    fireEvent.click(screen.getByRole("button", { name: "发音" }));
    const firstUtterance = mockSynthesis.speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;

    // Stop and start a second playback
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    fireEvent.click(screen.getByRole("button", { name: "发音" }));
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();

    // First utterance fires delayed end event
    act(() => {
      firstUtterance.onend?.(new Event("end"));
    });
    // State should still be playing second utterance!
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();

    // First utterance fires delayed error event
    act(() => {
      firstUtterance.onerror?.(new Event("error"));
    });
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
  });

  it("renders unsupported message when SpeechSynthesis is not available", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    render(<WordPronunciation word="saw" />);

    expect(screen.getByText("当前浏览器不支持发音")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发音" })).not.toBeInTheDocument();
  });
});
