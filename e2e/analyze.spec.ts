import { expect, test } from "@playwright/test";

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
