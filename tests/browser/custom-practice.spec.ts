import { gotoDartio, reloadDartio } from "./navigation";
import { expect, test, type Page, type Route } from "@playwright/test";

const PATH = "T20.D16";
const KEY = `dartio:custom-practice-log:v1:${PATH}`;
const PRO_ACCESS = {
  auth: "authenticated",
  effectivePlan: "pro",
  accessState: "active",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: [
    "local_scoring", "basic_checkout", "advanced_checkout", "online_multiplayer",
    "voice_always_on", "advanced_ai", "deep_stats", "custom_practice",
  ],
  limits: { aiMaxLevel: 20, historyMatches: null, onlineSeats: 8 },
  availability: {
    localScoring: "implemented", advancedAi: "implemented", advancedCheckout: "implemented",
    voiceInput: "implemented", history: "implemented", deepStats: "implemented",
    customPractice: "implemented", onlineMultiplayer: "implemented", clubManagement: "coming_soon",
  },
} as const;
const FREE_ACCESS = {
  ...PRO_ACCESS,
  auth: "anonymous",
  effectivePlan: "free",
  accessState: "free",
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 },
} as const;

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function pro(page: Page) {
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
}

test("a Pro player builds and completes one exact custom path", async ({ page }) => {
  await pro(page);
  const filed: unknown[] = [];
  await page.route("**/api/matches", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    filed.push(route.request().postDataJSON());
    await json(route, 201, { id: "custom-1" });
  });
  await gotoDartio(page, "/practice");
  await page.evaluate((key) => window.localStorage.removeItem(key), KEY);

  await page.getByRole("button", { name: "Add T20" }).click();
  await page.getByLabel("Target number").selectOption("16");
  await page.getByRole("radio", { name: "Double" }).click();
  await page.getByRole("button", { name: "Add D16" }).click();
  const start = page.getByRole("link", { name: "Walk this path" });
  await expect(start).toHaveAttribute("href", "/play/match?custom=T20.D16");
  await start.click();

  await expect(page.locator(".drill-target strong")).toHaveText("T20");
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".drill-target strong")).toHaveText("D16");
  await page.getByRole("radio", { name: "Double" }).click();
  await page.getByRole("button", { name: "Double 16, 32 points" }).click();
  await expect(page.getByRole("heading", { name: "2 of 2 beds taken" })).toBeVisible();
  await expect.poll(() => filed.length).toBe(1);
  expect(filed[0]).toMatchObject({
    ownerSeat: 0,
    record: {
      mode: "customPractice",
      options: {
        rulesVersion: 1,
        targets: [{ segment: 20, multiplier: 3 }, { segment: 16, multiplier: 2 }],
        hits: 2,
      },
      turns: [
        { turnNumber: 1, scoreBefore: 0, scoreAfter: 1, dartsThrown: 1 },
        { turnNumber: 2, scoreBefore: 1, scoreAfter: 2, dartsThrown: 1 },
      ],
    },
  });
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("a partial path resumes, then undo-to-empty stays discarded after reload", async ({ page }) => {
  await pro(page);
  await gotoDartio(page, `/play/match?custom=${PATH}`);
  await page.evaluate((key) => window.localStorage.removeItem(key), KEY);
  await reloadDartio(page);

  await page.getByRole("radio", { name: "Single" }).click();
  await page.getByRole("button", { name: "Single 1, 1 points" }).click();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), KEY)).not.toBeNull();
  await reloadDartio(page);
  await expect(page.locator(".match-notice")).toContainText("Resumed your exact T20 · D16 path");
  await expect(page.locator(".drill-figures")).toContainText("1");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBeNull();
  await reloadDartio(page);
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".drill-target strong")).toHaveText("T20");
  await expect(page.locator(".drill-figures")).toContainText("Darts0");
});

test("a Pro hydration pass preserves an unreadable future envelope", async ({ page }) => {
  await pro(page);
  const future = `${JSON.stringify({ storageVersion: 99, opaque: { keep: true } })}\n`;
  await gotoDartio(page, "/practice");
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), { key: KEY, value: future });

  await gotoDartio(page, `/play/match?custom=${PATH}`);
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toBeEnabled();
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBe(future);
  await expect(page.locator(".match-notice")).toHaveCount(0);
});

test("Free play exposes neither builder controls nor a direct-path scoring bypass", async ({ page }) => {
  await page.route("**/api/access", (route) => json(route, 200, FREE_ACCESS));
  await gotoDartio(page, "/practice");
  await expect(page.getByText("Custom paths are a Pro tool.")).toBeVisible();
  await expect(page.getByLabel("Target number")).toHaveCount(0);
  const future = `${JSON.stringify({ storageVersion: 99 })}\n`;
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), { key: KEY, value: future });

  await gotoDartio(page, `/play/match?custom=${PATH}`);
  await expect(page.getByRole("heading", { name: "This custom path needs Pro." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBe(future);
});

test("an invalid path is refused before a scoring surface renders", async ({ page }) => {
  await page.route("**/api/access", (route) => json(route, 200, FREE_ACCESS));
  await gotoDartio(page, "/play/match?custom=T25");
  // App Router can stream the shell with HTTP 200 before the segment throws
  // notFound; the rendered 404 boundary is the stable product contract.
  await expect(page.getByRole("heading", { name: "That dart missed the board." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toHaveCount(0);
});
