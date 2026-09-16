import { analyzeMock, EXAMPLE_SENTENCES, validateInput } from "./src/demo-data.mjs";
import { renderSegments } from "./src/view.mjs";

const form = document.querySelector("#analyze-form");
const input = document.querySelector("#sentence-input");
const count = document.querySelector("#character-count");
const button = document.querySelector("#analyze-button");
const buttonLabel = button.querySelector(".button-label");
const error = document.querySelector("#error-message");
const resultCard = document.querySelector("#result-card");
const skeleton = document.querySelector("#result-skeleton");
const sentenceResult = document.querySelector("#sentence-result");
const translation = document.querySelector("#translation");
const fallbackNote = document.querySelector("#fallback-note");
const exampleList = document.querySelector("#example-list");

function updateCount() {
  count.textContent = `${input.value.length} / 500`;
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
  resultCard.hidden = true;
  skeleton.hidden = true;
}

function setLoading(loading) {
  button.disabled = loading;
  buttonLabel.textContent = loading ? "分析中…" : "分析句子";
  skeleton.hidden = !loading;
  if (loading) {
    error.hidden = true;
    resultCard.hidden = true;
  }
}

function showResult(result) {
  sentenceResult.innerHTML = renderSegments(result.segments);
  translation.textContent = result.translation;
  fallbackNote.hidden = !result.isFallback;
  resultCard.hidden = false;
  resultCard.animate(
    [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 260, easing: "ease-out" },
  );
}

async function submitSentence() {
  const validation = validateInput(input.value);
  if (!validation.ok) return showError(validation.message);

  setLoading(true);
  await new Promise((resolve) => setTimeout(resolve, 720));
  const result = analyzeMock(validation.value);
  setLoading(false);
  showResult(result);
}

EXAMPLE_SENTENCES.forEach((sentence, index) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "example-chip";
  chip.textContent = `例句 ${index + 1}`;
  chip.title = sentence;
  chip.addEventListener("click", () => {
    input.value = sentence;
    updateCount();
    input.focus();
  });
  exampleList.append(chip);
});

input.addEventListener("input", () => {
  updateCount();
  error.hidden = true;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitSentence();
});

updateCount();

