import { expect, test } from "@playwright/test";

/**
 * A signed-out player must be able to score a full visit locally, and must see
 * the paid surfaces honestly locked rather than hidden or silently degraded.
 *
 * This is the visible half of the server-side authorization landed in Cycle 3;
 * the fail-closed half is covered by unit tests over the route handlers.
 */
const MATCH = "/play/match?start=501&level=8&best=5&out=double";

test("free play works and the paid surfaces say so", async ({ page }) => {
  await page.goto(MATCH, { waitUntil: "networkidle" });

  await expect(page.getByText("Alternate routes, setup-visit plans, and preferred doubles come with Pro."))
    .toBeAttached();
  // Both headings are honest outcomes: "Pro feature" when the server answered
  // Free, "unavailable" when access authority could not be reached. What must
  // never happen is voice presenting itself as usable.
  await expect(page.locator(".voice-access")).toContainText(
    /Voice scoring is a Pro feature|Voice access unavailable|Checking voice access/,
  );

  // Free scoring itself is entirely local, so it must work with no account.
  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.getByRole("button", { name: /^Treble 20, 60 points$/ }).click();
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("441");
});

test("an AI level above the free ceiling continues instead of blocking play", async ({ page }) => {
  await page.goto("/play/match?start=501&level=15&best=5&out=double", { waitUntil: "networkidle" });

  // The server refuses to generate a level-15 visit for an anonymous player.
  // The match must say so and keep playing at the free ceiling — never stall.
  const status = page.locator(".ai-access-status");
  await expect(status).toBeVisible();
  await expect(status).toContainText(/PRO REQUIRED|CHECKING PRO ACCESS|VERIFICATION UNAVAILABLE/);

  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.getByRole("button", { name: /^Treble 20, 60 points$/ }).click();
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("441");
});
