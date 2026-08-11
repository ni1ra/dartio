import { expect, test } from "@playwright/test";

/**
 * Cricket, end to end through the interface.
 *
 * The point of this cycle is that adding a mode does not touch the one beside
 * it: Cricket brings its own rules and its own log, and inherits the board,
 * the pad, the keyboard, correction, and resume unchanged.
 */
const CRICKET = "/play/match?mode=cricket&variant=standard&opponent=local";

test.beforeEach(async ({ page }) => {
  await page.goto(CRICKET, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.removeItem("dartio:cricket-log:v2:local"));
  await page.reload({ waitUntil: "networkidle" });
});

test("renders a real Cricket board and marks a treble as three", async ({ page }) => {
  await expect(page.locator(".cricket-board tbody tr")).toHaveCount(7);
  await expect(page.locator(".cricket-board tbody th").first()).toHaveText("20");
  await expect(page.locator(".cricket-board tbody th").last()).toHaveText("BULL");

  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  // Three marks closes the number outright.
  await expect(page.locator(".cricket-board tbody tr").first().locator("td").first()).toHaveText("⊗");
  await expect(page.locator(".match-dock")).toContainText("3 marks");
});

test("scores points only after the number is closed", async ({ page }) => {
  const points = page.locator(".cricket-board tfoot td").first().locator("strong");
  await expect(points).toHaveText("0");

  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(points).toHaveText("0");

  // The second treble is pure overflow: 60 points.
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(points).toHaveText("60");
});

test("inherits keyboard scoring, resume, and correction from the shared machinery", async ({ page }) => {
  await page.keyboard.press("1");
  await page.keyboard.press("9");
  await page.keyboard.press("t");
  await expect(page.locator(".cricket-board tbody tr").nth(1).locator("td").first()).toHaveText("⊗");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toContainText("Resumed the match");
  await expect(page.locator(".cricket-board tbody tr").nth(1).locator("td").first()).toHaveText("⊗");

  // Finish the visit so there is something to rewind to.
  await page.getByRole("button", { name: "Miss, 0 points" }).click();
  await page.getByRole("button", { name: "Miss, 0 points" }).click();
  await page.getByRole("button", { name: "Correct a visit" }).first().click();
  await page.locator(".correction-visits li").first().getByRole("button", { name: "Rewind here" }).click();
  await expect(page.locator(".cricket-board tbody tr").nth(1).locator("td").first()).toHaveText("");
});

test("tactics scores no points at all", async ({ page }) => {
  await page.goto("/play/match?mode=cricket&variant=tactics&opponent=local", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".cricket-board tfoot th")).toHaveText("MARKS");
  await expect(page.locator(".cricket-board tfoot td").first().locator("strong")).toHaveText("0");
});
