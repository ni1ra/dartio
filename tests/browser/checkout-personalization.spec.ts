import { expect, test, type Page, type Route } from "@playwright/test";
import { checkoutAdvice, type OutRule } from "../../src/domain";

const MATCH = "/play/match?start=301&level=8&best=1&out=double&opponent=local";

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
    customPractice: "coming_soon", onlineMultiplayer: "implemented", clubManagement: "coming_soon",
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

interface AdviceRequest {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly outRule: OutRule;
  readonly personalize: boolean;
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function openFreshMatch(page: Page) {
  await page.goto(MATCH, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.removeItem("dartio:x01-log:v2:local"));
  await page.reload({ waitUntil: "networkidle" });
}

async function moveOwnerTo169(page: Page) {
  await page.getByRole("tab", { name: "Visit total" }).click();
  const total = page.getByRole("textbox", { name: "Visit total" });
  await total.fill("132");
  await page.getByRole("button", { name: "Record visit" }).click();
  await total.fill("0");
  await page.getByRole("button", { name: "Record visit" }).click();
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("169");
}

function mockAdvancedCheckout(
  page: Page,
  evidence: "applied" | "sparse" | "unavailable",
  captured: AdviceRequest[],
) {
  return page.route("**/api/checkout/advice", async (route) => {
    const body = route.request().postDataJSON() as AdviceRequest;
    captured.push(body);
    const applied = body.personalize && evidence === "applied";
    const advice = checkoutAdvice(
      body.score,
      body.dartsAvailable,
      body.outRule,
      applied ? { preferredDoubles: [16] } : {},
    );
    await json(route, 200, {
      advice,
      personalization: body.personalize
        ? evidence === "applied"
          ? { status: "applied", x01Matches: 12, exactDarts: 186, finishingDoubles: 7 }
          : evidence === "sparse"
            ? { status: "sparse", x01Matches: 2, exactDarts: 14, finishingDoubles: 1 }
            : { status: "unavailable", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 }
        : { status: "off", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 },
    });
  });
}

test("explicit consent personalizes a finish setup and resets on reload", async ({ page }) => {
  const captured: AdviceRequest[] = [];
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
  await mockAdvancedCheckout(page, "applied", captured);
  await openFreshMatch(page);
  await moveOwnerTo169(page);

  const toggle = page.getByRole("button", { name: /Use my match history/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Off · your history stays unread.")).toBeVisible();
  await expect(page.locator(".checkout-leave strong")).toHaveText("40");

  await toggle.click();
  await expect(page.getByRole("button", { name: /Using my match history/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Personalized from 12 X01 matches · 186 exact darts · 7 finishing doubles/)).toBeVisible();
  await expect(page.locator(".checkout-leave strong")).toHaveText("32");
  expect(captured.some((body) => body.score === 169 && body.personalize)).toBe(true);
  for (const body of captured) expect(Object.keys(body).sort()).toEqual([
    "dartsAvailable", "outRule", "personalize", "score",
  ]);

  captured.length = 0;
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Use my match history/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Off · your history stays unread.")).toBeVisible();
  await expect(page.locator(".checkout-leave strong")).toHaveText("40");
  expect(captured.some((body) => body.score === 169 && body.personalize === false)).toBe(true);
  expect(captured.some((body) => body.personalize)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("sparse consent stays on the standard route and says why", async ({ page }) => {
  const captured: AdviceRequest[] = [];
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
  await mockAdvancedCheckout(page, "sparse", captured);
  await openFreshMatch(page);
  await moveOwnerTo169(page);

  await page.getByRole("button", { name: /Use my match history/ }).click();
  await expect(page.getByText(/History on · more exact darts are needed/)).toContainText(
    "2 X01 matches · 14 exact darts · 1 finishing double",
  );
  await expect(page.locator(".checkout-leave strong")).toHaveText("40");
  expect(captured.some((body) => body.score === 169 && body.personalize)).toBe(true);
});

test("unavailable history preserves standard Pro advice without pretending it was read", async ({ page }) => {
  const captured: AdviceRequest[] = [];
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
  await mockAdvancedCheckout(page, "unavailable", captured);
  await openFreshMatch(page);
  await moveOwnerTo169(page);

  await page.getByRole("button", { name: /Use my match history/ }).click();
  await expect(page.getByText("History is unavailable · standard Pro routes remain active without personalization."))
    .toBeVisible();
  await expect(page.locator(".checkout-leave strong")).toHaveText("40");
  await expect(page.locator(".checkout-tier-note")).toHaveCount(0);
  expect(captured.some((body) => body.score === 169 && body.personalize)).toBe(true);
});

test("Free play neither offers nor requests owned-history personalization", async ({ page }) => {
  let checkoutRequests = 0;
  await page.route("**/api/access", (route) => json(route, 200, FREE_ACCESS));
  await page.route("**/api/checkout/advice", async (route) => {
    checkoutRequests += 1;
    await json(route, 403, { error: "advanced_checkout_required" });
  });
  await openFreshMatch(page);

  await expect(page.getByRole("button", { name: /my match history/ })).toHaveCount(0);
  await expect(page.getByText("Alternate routes, setup-visit plans, and preferred doubles come with Pro."))
    .toBeAttached();
  expect(checkoutRequests).toBe(0);

  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("241");
});
