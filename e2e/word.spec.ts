import { expect, test, type Page, type Route } from "@playwright/test";

const original = "I saw a saw.";
const analysis = { original, segments: [{ start: 0, end: 1, type: "noun" }, { start: 2, end: 5, type: "verb" }, { start: 6, end: 11, type: "noun" }], translation: "我看见一把锯子。" };
const answer = (start: number) => ({
  word: "saw", start, end: start + 3, meaning: start === 2 ? "看见" : "锯子", lemma: start === 2 ? "see" : null,
  phonetic: { text: "/sɔː/", accent: "UK" },
  source: { url: "https://en.wiktionary.org/wiki/saw", license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } },
});

async function prepare(page: Page) {
  await page.route("**/api/analyze", route => route.fulfill({ json: analysis }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "英文句子" }).fill(original);
  await page.getByRole("button", { name: "分析句子" }).click();
  await expect(page.getByText(analysis.translation, { exact: true })).toBeVisible();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile word lookup" : "desktop word lookup", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile });
    test("selects each occurrence, keeps popover in viewport and caches repeat lookup", async ({ page }, testInfo) => {
      const requests: Array<{ start: number }> = [];
      await page.route("**/api/word", route => {
        const input = route.request().postDataJSON(); requests.push(input);
        return route.fulfill({ json: answer(input.start) });
      });
      await prepare(page);
      const words = page.getByRole("button", { name: "查询 saw", exact: true });
      if (mobile) await words.nth(0).tap();
      else { await words.nth(0).focus(); await page.keyboard.press("Enter"); }
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("看见", { exact: true })).toBeVisible();
      await expect(dialog).toContainText("英 /sɔː/");
      await expect(dialog.getByRole("link", { name: "Wiktionary 词条" })).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.screenshot({ path: testInfo.outputPath("word-popup.png"), fullPage: true });
      if (mobile) await dialog.getByRole("button", { name: "关闭查词" }).tap();
      else await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(words.nth(0)).toBeFocused();
      if (mobile) await words.nth(1).tap(); else await words.nth(1).click();
      await expect(dialog.getByText("锯子", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "关闭查词" }).click();
      await words.nth(1).click();
      await expect(dialog.getByText("锯子", { exact: true })).toBeVisible();
      expect(requests.map(r => r.start)).toEqual([2, 8]);
      expect(await page.getByTestId("highlighted-sentence").textContent()).toBe(original);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
      await page.getByRole("heading", { level: 1 }).click();
      await expect(dialog).toHaveCount(0);
    });
  });
}

test("late responses cannot replace another word or reappear after analysis restarts", async ({ page }) => {
  const pending: Route[] = [];
  await page.route("**/api/word", route => { pending.push(route); });
  await prepare(page);
  const words = page.getByRole("button", { name: "查询 saw", exact: true });
  await words.nth(0).click(); await expect.poll(() => pending.length).toBe(1);
  await words.nth(1).click(); await expect.poll(() => pending.length).toBe(2);
  await pending[1].fulfill({ json: answer(8) });
  await expect(page.getByRole("dialog").getByText("锯子", { exact: true })).toBeVisible();
  await pending[0].fulfill({ json: answer(2) });
  await expect(page.getByRole("dialog")).not.toContainText("看见");
  await words.nth(0).click(); await expect.poll(() => pending.length).toBe(3);
  await page.getByRole("button", { name: "分析句子" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pending[2].fulfill({ json: answer(2) });
  await expect(page.getByText(analysis.translation, { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("word errors and missing IPA remain local and can be retried", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/word", route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 429, json: { code: "RATE_LIMITED" } });
    if (calls === 2) return route.fulfill({ json: { ...answer(2), phonetic: null, source: null } });
    return route.fulfill({ json: answer(2) });
  });
  await prepare(page);
  await page.getByRole("button", { name: "查询 saw", exact: true }).nth(0).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveText("查词过于频繁，请稍后再试。");
  await expect(page.getByText(analysis.translation, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "重试" }).click();
  await expect(dialog).toContainText("暂无可靠音标");
  await dialog.getByRole("button", { name: "重试" }).click();
  await expect(dialog).toContainText("英 /sɔː/");
  expect(calls).toBe(3);
});
