const CLASS_NAMES = new Set(["noun", "adjective", "adverb", "verb", "neutral"]);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderSegments(segments) {
  return segments
    .map(({ text, type }) => {
      const safeType = CLASS_NAMES.has(type) ? type : "neutral";
      return `<span class="segment segment--${safeType}">${escapeHtml(text)}</span>`;
    })
    .join("");
}

