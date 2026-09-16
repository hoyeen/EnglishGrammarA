const PRESETS = new Map([
  [
    "The book that I bought yesterday is interesting.",
    {
      translation: "我昨天买的那本书很有意思。",
      segments: [
        { text: "The book", type: "noun" },
        { text: " ", type: "neutral" },
        { text: "that I bought yesterday", type: "adjective" },
        { text: " ", type: "neutral" },
        { text: "is", type: "verb" },
        { text: " ", type: "neutral" },
        { text: "interesting", type: "adjective" },
        { text: ".", type: "neutral" },
      ],
    },
  ],
  [
    "She left because she was tired.",
    {
      translation: "她因为累了而离开。",
      segments: [
        { text: "She", type: "noun" },
        { text: " ", type: "neutral" },
        { text: "left", type: "verb" },
        { text: " ", type: "neutral" },
        { text: "because she was tired", type: "adverb" },
        { text: ".", type: "neutral" },
      ],
    },
  ],
  [
    "What he said surprised everyone.",
    {
      translation: "他说的话让所有人都感到惊讶。",
      segments: [
        { text: "What he said", type: "noun" },
        { text: " ", type: "neutral" },
        { text: "surprised", type: "verb" },
        { text: " ", type: "neutral" },
        { text: "everyone", type: "noun" },
        { text: ".", type: "neutral" },
      ],
    },
  ],
  [
    "The man in a blue coat spoke slowly.",
    {
      translation: "那个穿蓝色外套的男人说话很慢。",
      segments: [
        { text: "The man", type: "noun" },
        { text: " ", type: "neutral" },
        { text: "in a blue coat", type: "adjective" },
        { text: " ", type: "neutral" },
        { text: "spoke", type: "verb" },
        { text: " ", type: "neutral" },
        { text: "slowly", type: "adverb" },
        { text: ".", type: "neutral" },
      ],
    },
  ],
]);

export const EXAMPLE_SENTENCES = [...PRESETS.keys()];

export function validateInput(raw) {
  const value = raw.trim();
  if (!value) return { ok: false, message: "请先输入一个英文句子。" };
  if (value.length > 500) return { ok: false, message: "句子不能超过 500 个字符。" };
  if (!/[A-Za-z]/.test(value)) return { ok: false, message: "目前仅支持英文句子。" };
  return { ok: true, value };
}

export function analyzeMock(raw) {
  const sentence = raw.trim();
  const preset = PRESETS.get(sentence);
  if (preset) return { original: sentence, ...preset, isFallback: false };

  return {
    original: sentence,
    translation: "这是演示模式。请选择下方示例句，以查看完整的四色分析和自然翻译。",
    segments: [{ text: sentence, type: "neutral" }],
    isFallback: true,
  };
}
