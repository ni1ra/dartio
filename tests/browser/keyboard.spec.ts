import { expect, test } from "@playwright/test";

/**
 * A whole visit scored from the keyboard.
 *
 * Tabbing to one of sixty-three buttons per dart is technically accessible and
 * practically unusable, so scoring has a real scheme: type the number, then
 * choose the bed. This drives it exactly as a player would.
 */
const MATCH = "/play/match?start=501&level=8&best=5&out=double&opponent=local";

test.beforeEach(async ({ page }) => {
  await page.goto(MATCH, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.removeItem("dartio:x01-log:v1"));
  await page.reload({ waitUntil: "networkidle" });
});

const score = (page: import("@playwright/test").Page) => page.locator(".score-player").first().locator("strong");

test("scores a full visit from the keyboard alone", async ({ page }) => {
  // T20, T20, S20 — 140.
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await page.keyboard.press("t");
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await page.keyboard.press("t");
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await page.keyboard.press("Enter");

  await expect(score(page)).toHaveText("361");
  await expect(page.locator(".history-strip li")).toHaveCount(1);
});

test("records bulls and misses, and undoes with backspace", async ({ page }) => {
  await page.keyboard.press("b");
  await expect(score(page)).toHaveText("476");
  await page.keyboard.press("B");
  await expect(score(page)).toHaveText("426");
  await page.keyboard.press("m");
  await expect(score(page)).toHaveText("426");

  // The visit ended on the miss, so backspace takes back that third dart.
  await page.keyboard.press("Backspace");
  await expect(score(page)).toHaveText("426");
  await expect(page.locator(".history-strip li")).toHaveCount(0);
});

test("shows what has been typed and clears it on escape", async ({ page }) => {
  await page.keyboard.press("1");
  await page.keyboard.press("9");
  await expect(page.locator(".keyboard-buffer")).toContainText("19");

  await page.keyboard.press("Escape");
  await expect(page.locator(".keyboard-buffer")).toHaveCount(0);
  await expect(score(page)).toHaveText("501");
});

test("does not capture typing meant for a form field", async ({ page }) => {
  await page.goto("/friends", { waitUntil: "networkidle" });
  const field = page.getByLabel("Room code");
  await field.fill("");
  await field.pressSequentially("OCHE20");
  await expect(field).toHaveValue("OCHE20");
});
