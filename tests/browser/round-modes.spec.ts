import { expect, test } from "@playwright/test";

/**
 * The four round-based modes, played through the interface.
 *
 * They share one screen because they differ in how a visit scores, not in how
 * it is played — so this drives the shared surface once per mode rather than
 * re-testing the board and the pad four times.
 */
const total = (page: import("@playwright/test").Page) => page.locator(".round-totals strong").first();

test.beforeEach(async ({ page }) => {
  await page.goto("/practice", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("dartio:round-log:")) window.localStorage.removeItem(key);
    }
  });
});

test("the practice catalogue links every playable mode", async ({ page }) => {
  await page.goto("/practice", { waitUntil: "networkidle" });
  for (const name of ["Cricket", "Around the clock", "Shanghai", "Count-up", "Bob’s 27"]) {
    await expect(page.getByRole("link", { name: new RegExp(name, "i") })).toBeVisible();
  }
});

test("Around the Clock advances through its targets", async ({ page }) => {
  await page.goto("/play/match?mode=aroundTheClock", { waitUntil: "networkidle" });
  await expect(page.locator(".round-target")).toContainText("1");

  // Typed rather than tapped: the pad defaults to the treble bed, and this
  // also proves the shared keyboard scheme reaches these modes.
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.locator(".round-target")).toContainText("2");
  await expect(total(page)).toHaveText("1");
});

test("Shanghai scores only the round's number", async ({ page }) => {
  await page.goto("/play/match?mode=shanghai", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(total(page)).toHaveText("0");

  await page.keyboard.press("1");
  await page.keyboard.press("t");
  await expect(total(page)).toHaveText("3");
});

test("Count-Up counts everything and Bob's 27 starts on 27", async ({ page }) => {
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  await expect(page.locator(".round-target")).toContainText("Everything counts");
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(total(page)).toHaveText("60");

  await page.goto("/play/match?mode=bobs27", { waitUntil: "networkidle" });
  await expect(total(page)).toHaveText("27");
  await page.keyboard.press("1");
  await page.keyboard.press("d");
  await expect(total(page)).toHaveText("29");
});

test("a round mode resumes after a reload", async ({ page }) => {
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(total(page)).toHaveText("60");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toContainText("Resumed the match");
  await expect(total(page)).toHaveText("60");
});
