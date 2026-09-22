import { expect, test, type Route } from "@playwright/test";

const sentence = "She left because she was tired.";

test("analyzes a sentence on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        original: sentence,
        segments: [
          { start: 0, end: 3, type: "noun" },
          { start: 4, end: 8, type: "verb" },
          { start: 9, end: 31, type: "adverb" },
        ],
        translation: "她因为累了而离开。",
      }),
    }),
  );

  await page.goto("/");
  await page.getByRole("textbox", { name: "英文句子" }).fill(sentence);
  await page.getByRole("button", { name: "分析句子" }).click();

  await expect(page.getByText("她因为累了而离开。")).toBeVisible();
  await expect(page.getByTestId("highlighted-sentence")).toHaveText(sentence);
  for (const label of ["名词性", "形容词性", "副词性", "动词"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("supports keyboard navigation and reports empty input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "英文句子" }).focus();
  await expect(page.getByRole("textbox", { name: "英文句子" })).toBeFocused();
  await page.getByRole("button", { name: "分析句子" }).click();
  await expect(page.getByText("请先输入一个英文句子。", { exact: true })).toBeVisible();
});

test("preserves input when the service is rate limited", async ({ page }) => {
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试。",
      }),
    }),
  );

  await page.goto("/");
  await page.getByRole("textbox", { name: "英文句子" }).fill(sentence);
  await page.getByRole("button", { name: "分析句子" }).click();

  await expect(page.getByText("请求过于频繁，请稍后再试。", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "英文句子" })).toHaveValue(sentence);
});

test("keeps a full clipboard paste above the limit and enables analysis after shortening", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const submitted: string[] = [];
  await page.route("**/api/analyze", async (route) => {
    const original = route.request().postDataJSON().sentence as string;
    submitted.push(original);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        original,
        segments: [{ start: 0, end: original.length, type: "noun" }],
        translation: "测试译文。",
      }),
    });
  });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "英文句子" });
  const longSentence = "A".repeat(500) + ".";
  await page.evaluate((text) => navigator.clipboard.writeText(text), longSentence);
  await input.focus();
  await page.keyboard.press("ControlOrMeta+V");

  await expect(input).toHaveValue(longSentence);
  await expect(page.getByRole("status")).toContainText("501 / 500");
  await expect(input).toHaveAccessibleDescription(/超出 1 个字符，请缩短后再分析。/);
  await expect(page.getByRole("button", { name: "分析句子" })).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Meta+Enter");
  await input.evaluate((element: HTMLTextAreaElement) => element.form!.requestSubmit());
  expect(submitted).toEqual([]);

  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue(longSentence.slice(0, 500));
  await expect(page.getByRole("button", { name: "分析句子" })).toBeEnabled();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("测试译文。", { exact: true })).toBeVisible();
  expect(submitted).toEqual([longSentence.slice(0, 500)]);
});

test("allows only one pending keyboard request, restores input after failure and accepts a new sentence", async ({ page }) => {
  const pending: Route[] = [];
  await page.route("**/api/analyze", (route) => { pending.push(route); });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "英文句子" });
  await input.fill(sentence);
  await input.press("Control+Enter");
  await expect.poll(() => pending.length).toBe(1);
  await expect(input).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  await page.keyboard.press("Meta+Enter");
  await input.evaluate((element: HTMLTextAreaElement) => {
    element.form!.requestSubmit();
    element.form!.requestSubmit();
  });

  await pending[0].fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ message: "分析失败，请重试。" }),
  });
  await expect(page.getByRole("region", { name: "英文句子分析器" }).getByRole("alert"))
    .toHaveText("分析失败，请重试。");
  expect(pending).toHaveLength(1);
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue(sentence);

  await input.fill("They stayed.");
  await input.press("Meta+Enter");
  await expect.poll(() => pending.length).toBe(2);
  expect(pending[1].request().postDataJSON()).toEqual({ sentence: "They stayed." });
  await pending[1].fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      original: "They stayed.",
      segments: [{ start: 0, end: 4, type: "noun" }, { start: 5, end: 11, type: "verb" }],
      translation: "他们留下了。",
    }),
  });
  await expect(page.getByTestId("highlighted-sentence")).toHaveText("They stayed.");
  await expect(page.getByText("他们留下了。", { exact: true })).toBeVisible();
  await expect(input).toBeEnabled();
  expect(pending).toHaveLength(2);
});
