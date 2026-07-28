import { expect, test } from "@playwright/test";

/**
 * The regulation dartboard gate, as an executable test.
 *
 * `docs/REPO_CONTROL.md` requires that any board change re-runs the physical
 * T20 and boundary suite at each supported width. Until now that gate had no
 * executable form, so it could only be honoured by remembering to do it.
 *
 * The geometry assertions come straight from the renderer's contract: one
 * square, in-bounds SVG; four scoring beds per segment across twenty segments;
 * twenty numerals; and a click on the physical treble-twenty path scoring 60.
 */
const MATCH = "/play/match?start=501&level=8&best=5&out=double";

test.beforeEach(async ({ page }) => {
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await expect(page.locator("svg.dartboard")).toBeVisible();
});

test("renders one square, in-bounds board", async ({ page }) => {
  const board = page.locator("svg.dartboard");
  await expect(board).toHaveCount(1);

  const box = (await board.boundingBox())!;
  expect(box, "board has no layout box").toBeTruthy();
  expect(Math.abs(box.width - box.height), "board is not square").toBeLessThanOrEqual(1);

  const viewport = page.viewportSize()!;
  expect(box.x, "board starts left of the viewport").toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, "board runs past the viewport").toBeLessThanOrEqual(viewport.width + 1);
});

test("renders 80 scoring beds and 20 numerals", async ({ page }) => {
  await expect(page.locator("svg.dartboard .board-bed")).toHaveCount(80);
  await expect(page.locator("svg.dartboard .board-number")).toHaveCount(20);
});

test("a physical click on the treble twenty scores 60", async ({ page }) => {
  const board = page.locator("svg.dartboard");
  const box = (await board.boundingBox())!;

  /*
   * The renderer draws on a 320-unit viewBox with the board centred at (160,160)
   * and a 136-unit radius. Treble twenty sits directly above centre, between the
   * treble ring's inner and outer radii — 0.5975 and 0.6294 of the board radius.
   * Aiming at the midpoint keeps the click inside the bed at every scale.
   */
  const trebleRadius = ((0.5975 + 0.6294) / 2) * (136 / 160);
  await board.click({
    position: { x: box.width / 2, y: box.height / 2 - (box.height / 2) * trebleRadius },
  });

  await expect(page.locator(".throw-mark")).toHaveCount(1);
  await expect(page.getByText("T20 registered")).toBeVisible();
  // 501 − 60. The scoreboard is the player's source of truth, so assert there.
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("441");
});
