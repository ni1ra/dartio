import { expect, test, type Page } from "@playwright/test";

/**
 * Play an actual match against the AI, with real clicks on the real board.
 *
 * This exists because an endless-AI-turn bug shipped to production while 117
 * browser checks passed. Every one of them asserted something *around* the
 * match — that the route loads, that the board has 80 beds, that themes stay
 * legible, that a keypress registers — and not one of them ever played a leg.
 *
 * The failure it missed: `commitEvents` folded over the `log` captured in its
 * closure, so the AI's `setTimeout` committed against a stale log, decided from
 * the stale result that it was still its turn, and re-queued itself forever.
 * Scores oscillated because busts kept replaying, and darts landed against
 * whichever player the stale turn order named.
 *
 * So this test asserts the two things a player would notice in the first ten
 * seconds and no unit test can see: the turn comes back, and a score never
 * climbs.
 */

const MATCH = "/play/match?start=501&level=8&best=5&in=straight&out=double&opponent=ai";

/** Reads both scores and who is at the oche, as a player would see them. */
async function board(page: Page) {
  return page.evaluate(() => {
    const players = [...document.querySelectorAll(".score-player")].map((el) => ({
      score: Number(el.querySelector("strong")?.textContent?.trim() ?? "0"),
      active: el.classList.contains("active"),
    }));
    return { you: players[0]!, ai: players[1]! };
  });
}

/** Clicks the board three times, which is one visit. */
async function throwVisit(page: Page) {
  const target = page.locator(".dartboard");
  const box = (await target.boundingBox())!;
  // Three points inside the scoring area, away from the exact centre so the
  // visit is ordinary rather than three bulls.
  const points = [
    { x: 0.5, y: 0.26 },
    { x: 0.5, y: 0.3 },
    { x: 0.62, y: 0.36 },
  ];
  for (const p of points) {
    await target.click({ position: { x: box.width * p.x, y: box.height * p.y } });
    await page.waitForTimeout(250);
  }
}

test("a match against the AI alternates turns instead of looping", async ({ page }) => {
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await page.locator(".dartboard").waitFor();

  const start = await board(page);
  expect(start.you.score, "the leg should open on the starting score").toBe(501);
  expect(start.you.active, "the player throws first").toBe(true);

  let previousYou = start.you.score;
  let previousAi = start.ai.score;

  for (let visit = 1; visit <= 3; visit += 1) {
    await throwVisit(page);

    // The AI replies once. If it loops, the turn never comes back and this
    // fails here rather than after the scores have been scrambled.
    await expect
      .poll(async () => (await board(page)).you.active, {
        timeout: 15_000,
        message: `turn never returned to the player after visit ${visit} — the AI is still throwing`,
      })
      .toBe(true);

    const now = await board(page);

    /*
     * A score may stay level (a whole visit busted) but must never rise. The
     * shipped bug made scores climb, because a stale replay reinstated a score
     * that had already been reduced.
     */
    expect(now.you.score, `player score rose from ${previousYou} to ${now.you.score}`)
      .toBeLessThanOrEqual(previousYou);
    expect(now.ai.score, `AI score rose from ${previousAi} to ${now.ai.score}`)
      .toBeLessThanOrEqual(previousAi);

    // Both sides must actually be throwing — a frozen match would also satisfy
    // "never rises".
    expect(now.ai.score, "the AI never threw").toBeLessThan(501);

    previousYou = now.you.score;
    previousAi = now.ai.score;
  }

  /*
   * Settle check: with nobody touching the board, nothing may move. Under the
   * bug the AI kept throwing into this window.
   */
  const settled = await board(page);
  await page.waitForTimeout(4000);
  const later = await board(page);
  expect(later, "the match kept playing itself while the player was idle").toEqual(settled);
});
