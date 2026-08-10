import { expect, test } from "@playwright/test";

/**
 * The rooms surface, signed out.
 *
 * The suite has no account, so it cannot open a room — that is proven against a real
 * deployment by `pnpm verify:history`'s sibling gate. What it can prove is that the
 * page no longer lies: it used to accept any six-character code, wait 700 ms on a
 * `setTimeout`, and always answer "that room isn't live", which looked exactly like
 * a real lookup failing.
 */
test("the join form no longer fakes a lookup", async ({ page }) => {
  await page.goto("/friends", { waitUntil: "networkidle" });

  const join = page.getByRole("button", { name: /join room/i });
  const watch = page.getByRole("button", { name: /watch instead/i });
  await expect(join).toBeDisabled();
  await expect(watch).toBeDisabled();

  await page.getByLabel(/room code/i).fill("OCHE42");
  // A full code is still not enough without an account, and nothing pretends to search.
  await expect(join).toBeDisabled();
  await expect(watch).toBeDisabled();
  await expect(page.getByText(/that room isn’t live/i)).toHaveCount(0);
});

test("hosting points at Pro rather than at a dead button", async ({ page }) => {
  await page.goto("/friends", { waitUntil: "networkidle" });

  // It used to read "Hosting is not open yet" and do nothing at all.
  await expect(page.getByRole("link", { name: /online rooms are pro/i })).toBeVisible();
  await expect(page.getByText(/hosting is not open yet/i)).toHaveCount(0);
});

test("the page claims only what is built", async ({ page }) => {
  await page.goto("/friends", { waitUntil: "networkidle" });

  const foundation = page.locator(".room-foundation");
  await expect(foundation).toContainText(/one shared record/i);
  // Spectators shipped in Cycle 23, handover and close in Cycle 24. The rooms
  // promise is complete: every chip is a fact and nothing is "planned" any more.
  await expect(foundation).toContainText(/live · spectators/i);
  await expect(foundation).toContainText(/live · the host can hand the room over/i);
  await expect(foundation.getByText(/planned/i)).toHaveCount(0);
});
