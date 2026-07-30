import { expect, test } from "@playwright/test";

/**
 * The three practice drills, played through the interface.
 *
 * They were catalogue rows labelled COMING NEXT for the whole of Phase 1. These
 * assert that they are reachable, that they score, and that they advance — the
 * three things a row on a page cannot fake.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/practice", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("dartio:drill-log:")) window.localStorage.removeItem(key);
    }
  });
});

test("every practice row is playable, with none left coming soon", async ({ page }) => {
  await page.goto("/practice", { waitUntil: "networkidle" });

  await expect(page.getByText("COMING NEXT")).toHaveCount(0);
  for (const name of ["Checkout lab", "Doubles matrix", "Scoring sprint"]) {
    await expect(page.getByRole("link", { name: new RegExp(name, "i") })).toBeVisible();
  }
});

test("Doubles Matrix takes the attempt on the double and moves to the next", async ({ page }) => {
  await page.goto("/play/match?drill=doublesMatrix", { waitUntil: "networkidle" });
  await expect(page.locator(".drill-target strong")).toHaveText("1");

  // Typed rather than tapped: the pad defaults to the treble bed, and this also
  // proves the shared keyboard scheme reaches the drills.
  await page.keyboard.press("1");
  await page.keyboard.press("d");

  await expect(page.locator(".drill-target strong")).toHaveText("2");
  await expect(page.locator(".drill-history li").first()).toContainText(/took it/i);
});

test("Checkout Lab refuses a finish that did not land on a double", async ({ page }) => {
  await page.goto("/play/match?drill=checkoutLab", { waitUntil: "networkidle" });
  await expect(page.locator(".drill-target strong")).toHaveText("40");

  // Double ten, then a single twenty: forty exactly, but not finished on a double.
  await page.keyboard.press("1");
  await page.keyboard.press("0");
  await page.keyboard.press("d");
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await page.keyboard.press("Enter");

  await expect(page.locator(".drill-history li").first()).toContainText(/missed/i);
});

test("Scoring Sprint counts everything and aims at nothing", async ({ page }) => {
  await page.goto("/play/match?drill=scoringSprint", { waitUntil: "networkidle" });
  await expect(page.locator(".drill-target span")).toContainText(/anything counts/i);

  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();

  await expect(page.locator(".drill-history li").first()).toContainText(/took it/i);
});

test("a drill resumes after a reload", async ({ page }) => {
  await page.goto("/play/match?drill=doublesMatrix", { waitUntil: "networkidle" });
  await page.keyboard.press("1");
  await page.keyboard.press("d");
  await expect(page.locator(".drill-target strong")).toHaveText("2");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toContainText(/resumed the drill/i);
  await expect(page.locator(".drill-target strong")).toHaveText("2");
});
