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
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(String(error)));

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
  });
}

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
