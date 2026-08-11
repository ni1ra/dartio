import { expect, test } from "@playwright/test";

/**
 * The match log, proven through the interface.
 *
 * A match used to live in one React state, so a refresh lost the leg and
 * correction reached no further than the latest dart. These are the two
 * user-visible consequences of moving to an event log.
 */
const MATCH = "/play/match?start=501&level=8&best=5&out=double&opponent=local";

async function scoreVisit(page: import("@playwright/test").Page, ...beds: readonly string[]) {
  for (const bed of beds) await page.getByRole("button", { name: bed }).click();
}

test.beforeEach(async ({ page }) => {
  // Cleared once, on the way in — not through addInitScript, which would run
  // again on the reload these tests depend on and wipe the log under them.
  await page.goto(MATCH, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.removeItem("dartio:x01-log:v2:local"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Each dart" }).click();
});

test("a reload resumes the match exactly where it was left", async ({ page }) => {
  await scoreVisit(page, "Treble 20, 60 points", "Treble 20, 60 points", "Treble 20, 60 points");
  const first = page.locator(".score-player").first().locator("strong");
  await expect(first).toHaveText("321");

  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator(".match-notice")).toContainText("Resumed the match");
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("321");
  // The visit is still in the history, not just the number on the scoreboard.
  await expect(page.locator(".history-strip li")).toHaveCount(1);
});

test("the match rewinds to a visit from earlier in the leg", async ({ page }) => {
  // Player one, then the local opponent, then player one again.
  await scoreVisit(page, "Treble 20, 60 points", "Treble 20, 60 points", "Treble 20, 60 points");
  // Kept on the treble bed so the pad's multiplier never has to change mid-test.
  await scoreVisit(page, "Treble 20, 60 points", "Treble 20, 60 points", "Treble 20, 60 points");
  await scoreVisit(page, "Treble 19, 57 points", "Treble 19, 57 points", "Treble 19, 57 points");

  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("150");
  await expect(page.locator(".history-strip li")).toHaveCount(3);

  await page.getByRole("button", { name: "Correct last dart" }).click();
  const visits = page.locator(".correction-visits li");
  await expect(visits).toHaveCount(3);

  // Rewind to the second visit — two visits back, which the old latest-dart
  // undo could not reach. The first visit stands; everything after is dropped.
  await visits.nth(1).getByRole("button", { name: "Rewind here" }).click();

  await expect(page.locator(".match-dock")).toContainText("Rewound 6 entries");
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("321");
  await expect(page.locator(".history-strip li")).toHaveCount(1);
});

test("starting a different match does not resume the stored one", async ({ page }) => {
  await scoreVisit(page, "Treble 20, 60 points", "Treble 20, 60 points", "Treble 20, 60 points");
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("321");

  // Different starting score: the stored log belongs to a different match.
  await page.goto("/play/match?start=301&level=8&best=5&out=double&opponent=local", { waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("301");
});
