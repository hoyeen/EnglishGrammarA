import { expect, test } from "@playwright/test";

for (const mobile of [false, true]) {
  test(mobile ? "translates a phrase on mobile" : "translates a phrase on desktop", async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.route("**/api/translate", route => route.fulfill({ json: { original: "take off", meanings: ["起飞", "脱下"] } }));
    await page.goto("/");
    await page.getByRole("tab", { name: "单词／短语翻译" }).click();
    await page.getByRole("textbox", { name: "输入英文单词或短语" }).fill("take off");
    await page.getByRole("button", { name: "翻译", exact: true }).click();
    await expect(page.getByText("起飞", { exact: true })).toBeVisible();
    await expect(page.getByText("脱下", { exact: true })).toBeVisible();
    if (mobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("tab", { name: "句子分析" }).click();
    await expect(page.getByRole("textbox", { name: "英文句子" })).toBeVisible();
  });
}
