"use client";

import { useEffect, useRef, useState } from "react";

export function WordPronunciation({ word }: { word: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownsPlaybackRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    Boolean(window.speechSynthesis) &&
    typeof SpeechSynthesisUtterance !== "undefined";

  useEffect(() => {
    return () => {
      playbackIdRef.current += 1;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (ownsPlaybackRef.current && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      ownsPlaybackRef.current = false;
    };
  }, []);

  if (!isSupported) {
    return (
      <div className="word-pronunciation">
        <span className="word-pronunciation__unsupported">当前浏览器不支持发音</span>
      </div>
    );
  }

  const stopPlayback = () => {
    playbackIdRef.current += 1;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (ownsPlaybackRef.current && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    ownsPlaybackRef.current = false;
    setIsPlaying(false);
  };

  const playSpeech = () => {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      return;
    }

    // 清空现有队列，避免排队
    window.speechSynthesis.cancel();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    playbackIdRef.current += 1;
    const currentId = playbackIdRef.current;

    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const ukVoice = voices.find((v) => /^en[-_]gb($|[-_])/i.test(v.lang));
    const otherEnVoice = voices.find((v) => /^en($|[-_])/i.test(v.lang));
    const selectedVoice = ukVoice ?? otherEnVoice;

    const utterance = new SpeechSynthesisUtterance(word);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "en-GB";
    }

    const handleFinish = () => {
      if (playbackIdRef.current === currentId) {
        ownsPlaybackRef.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsPlaying(false);
      }
    };

    utterance.onend = handleFinish;
    utterance.onerror = handleFinish;

    timeoutRef.current = setTimeout(() => {
      if (playbackIdRef.current === currentId) {
        if (ownsPlaybackRef.current && typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        ownsPlaybackRef.current = false;
        setIsPlaying(false);
        timeoutRef.current = null;
      }
    }, 15000);

    ownsPlaybackRef.current = true;
    setIsPlaying(true);
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      handleFinish();
    }
  };

  return (
    <div className="word-pronunciation">
      <button
        type="button"
        className="word-pronunciation__button"
        onClick={isPlaying ? stopPlayback : playSpeech}
      >
        {isPlaying ? "停止" : "发音"}
      </button>
      <span className="word-pronunciation__hint">发音不保证匹配上下文音标</span>
    </div>
  );
}
