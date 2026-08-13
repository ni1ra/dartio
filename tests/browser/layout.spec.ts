import { expect, test } from "@playwright/test";

/**
 * Every public route, at every supported width, must load without a horizontal
 * scrollbar and without a console error. Both were verified by hand in earlier
 * cycles; this makes the claim re-runnable.
 */
const ROUTES = [
  ["landing", "/"],
  ["setup", "/play"],
  ["match", "/play/match?start=501&level=8&best=5&out=double"],
  ["practice", "/practice"],
  ["friends", "/friends"],
  ["pricing", "/pricing"],
  ["account", "/account"],
  ["sign-in", "/auth/sign-in"],
] as const;

for (const [name, path] of ROUTES) {
  test(`${name} loads without overflow or console errors`, async ({ page }) => {
    /*
     * Two different signals, kept apart on purpose.
     *
     * `problems` is application misbehaviour: an uncaught exception, or code
     * calling console.error. `failedRequests` is the network. They are separated
     * because a fail-closed 503 from /api/access is correct behaviour when
     * access authority is unreachable — the product is designed to degrade to
     * local free play — and the browser logs that as a console error. Folding
     * the two together would make the suite fail on the app working as intended.
     */
    const problems: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Resource-load failures arrive with no source location; the response
      // listener below is the precise signal for those.
      if (message.text().startsWith("Failed to load resource")) return;
      problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (response.status() < 400) return;
      /*
       * API responses are deliberately out of scope here. These routes are
       * designed to fail closed when identity or billing authority is
       * unreachable, and this suite runs against environments where it is —
       * their contracts are covered by unit tests over the handlers and by
       * entitlements.spec.ts. What this assertion protects is the shell: a
       * missing font, a 404 icon, a broken chunk.
       */
      if (url.pathname.startsWith("/api/")) return;
      failedRequests.push(`${response.status()} ${url.pathname}`);
    });

    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status(), `${name} responded ${response?.status()}`).toBeLessThan(400);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    expect(
      overflow.scrollWidth,
      `${name} overflows horizontally: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    expect(problems, `${name} console: ${problems.join(" | ")}`).toEqual([]);
    expect(failedRequests, `${name} requests: ${failedRequests.join(" | ")}`).toEqual([]);
  });
}

test("public product claims match shipped availability", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.locator(".signal-track > span").first().locator("i", { hasText: "ONLINE ROOMS" }),
  ).toBeVisible();

  await page.goto("/pricing", { waitUntil: "networkidle" });
  const pro = page.locator(".pro-plan");
  await expect(pro.locator("li", { hasText: "Advanced checkout routes" })).toContainText("AVAILABLE");
  await expect(pro.locator("li", { hasText: "Deep statistics and online rooms" })).toContainText("AVAILABLE");
  await expect(pro.locator("li", { hasText: "Custom practice paths" })).toContainText("AVAILABLE");
  await expect(page.locator(".club-plan")).toContainText("Club management remains under active development.");

  await page.goto("/account", { waitUntil: "networkidle" });
  await expect(page.getByText("Online rooms are live with Pro.", { exact: false })).toBeVisible();
  await expect(page.getByText("Online rooms are still being built.", { exact: false })).toHaveCount(0);
});

/*
 * The nav must offer a signed-out visitor a way into an account.
 *
 * This is the regression Lain found by looking at the deployed site: `/auth/sign-in`
 * existed and loaded, so the route list above passed, while nothing on any page
 * linked to it above 760px. A route that answers 200 and a route a visitor can
 * reach are different claims, and only the first one was ever being tested.
 *
 * AccountNav is a client component that renders a neutral "Account" label until
 * the session resolves, so the server HTML never contains these links and no
 * amount of grepping the response body can prove this. It needs a real browser
 * that has run the hydration.
 */
test("a signed-out visitor is offered a way into an account from the nav", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  /*
   * Visible, not merely present. The defect this catches was a link that existed
   * in the DOM at every width and was painted at none of them below 1100px, which
   * is indistinguishable from a working nav to anything that reads the markup.
   */
  await expect(
    page.locator('a.account-nav[href="/auth/sign-in"]'),
    "the nav offers no visible way to sign in",
  ).toBeVisible();

  // The pending placeholder is transparent by design while the session resolves.
  // If it is still there after networkidle, the visitor is looking at nothing.
  await expect(page.locator(".account-nav--pending")).toHaveCount(0);
});

test("the desktop bar also offers sign-up", async ({ page }) => {
  // Sign-up is deliberately dropped below 1100px: the bar has room for one action
  // and the bottom navigation carries "You". Only assert it where it should exist.
  test.skip(
    (page.viewportSize()?.width ?? 0) <= 1100,
    "sign-up is desktop-only by design",
  );
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('a[href="/auth/sign-up"]')).toBeVisible();
});

test("every interactive control on the match page takes visible keyboard focus", async ({ page }) => {
  await page.goto("/play/match?start=501&level=8&best=5&out=double", { waitUntil: "networkidle" });
  // A focus ring that is not drawn is the accessibility defect that ships most
  // often, because it is invisible until someone tabs.
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });
    if (!focused) continue;
    const ringed = focused.outlineStyle !== "none" && parseFloat(focused.outlineWidth) > 0;
    const shadowed = focused.boxShadow !== "none";
    expect(ringed || shadowed, `${focused.tag} took focus with no visible ring`).toBe(true);
  }
});

/**
 * The match has to fit the screen it reserves.
 *
 * Lain's note was "not utilizing max screenspace for me". Measured on production at
 * 1440×1000 the page ran to 1229px and the command dock sat at y=1036 — so Undo and
 * Correct were below the fold and the page scrolled to reach them, on the one screen
 * a player uses while standing at the oche.
 */
test("the match fits the screen, with the dock reachable without scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The reservation being tested is the desktop one");

  await page.goto("/play/match?start=501&best=5&opponent=local", { waitUntil: "networkidle" });

  // A pixel of tolerance: sub-pixel layout rounding puts the dock's edge at
  // 1000.39 in a 1000px viewport, and a third of a pixel is not scrolling. The
  // claim being tested is that a player can reach Undo without scrolling, not
  // that the arithmetic is exact.
  const viewport = page.viewportSize()!.height + 1;
  const dock = await page.locator(".match-dock").boundingBox();
  expect(dock).not.toBeNull();
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(viewport);

  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(documentHeight).toBeLessThanOrEqual(viewport);
});
