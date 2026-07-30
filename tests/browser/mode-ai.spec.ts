import { expect, test } from "@playwright/test";

/**
 * Opponents in Cricket and the round modes.
 *
 * The assertion that matters is that the opponent throws once and hands the board
 * back. X01's opponent once played entire matches by itself: it committed from a
 * timer whose closure was a visit old, read the stale result to decide whose turn
 * it was, concluded it was still its own, and re-queued forever. These modes reuse
 * the ref-based fix, and this is what proves it.
 */
test("a Cricket opponent throws one visit and gives the board back", async ({ page }) => {
  await page.goto("/play/match?mode=cricket&opponent=ai&level=3", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator(".match-live")).toContainText("ROUND 1");

  // A full visit from the player, typed, then the opponent's reply.
  for (let dart = 0; dart < 3; dart += 1) {
    await page.keyboard.press("2");
    await page.keyboard.press("0");
    await page.keyboard.press("Enter");
  }

  await expect(page.locator(".match-live")).toContainText("ROUND 2", { timeout: 10_000 });
  // And it stays there: a looping opponent would run the round count away.
  await page.waitForTimeout(2500);
  await expect(page.locator(".match-live")).toContainText("ROUND 2");
});

test("a round-mode opponent throws one visit and gives the board back", async ({ page }) => {
  await page.goto("/play/match?mode=countUp&opponent=ai&level=3", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("dartio:round-log:")) window.localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator(".match-live")).toContainText("ROUND 1");
  for (let dart = 0; dart < 3; dart += 1) {
    await page.keyboard.press("2");
    await page.keyboard.press("0");
    await page.keyboard.press("Enter");
  }

  await expect(page.locator(".match-live")).toContainText("ROUND 2", { timeout: 10_000 });
  await page.waitForTimeout(2500);
  await expect(page.locator(".match-live")).toContainText("ROUND 2");
});

test("these modes are still solo or local when no opponent is asked for", async ({ page }) => {
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  // Nobody is added uninvited: practice stays practice.
  await expect(page.getByText("The Navigator")).toHaveCount(0);
});
