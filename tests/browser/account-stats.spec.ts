import { expect, test, type Page, type Route } from "@playwright/test";

const TIMESTAMP = "2026-08-12T18:30:00.000Z";

const FREE_ACCESS = {
  auth: "authenticated",
  effectivePlan: "free",
  accessState: "free",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 },
  availability: {
    localScoring: "implemented", advancedAi: "implemented", advancedCheckout: "implemented",
    voiceInput: "implemented", history: "implemented", deepStats: "implemented",
    onlineMultiplayer: "implemented", customPractice: "coming_soon", clubManagement: "coming_soon",
  },
} as const;

const PRO_ACCESS = {
  ...FREE_ACCESS,
  effectivePlan: "pro",
  accessState: "active",
  entitlements: [
    "local_scoring", "basic_checkout", "advanced_checkout", "voice_always_on",
    "advanced_ai", "deep_stats",
  ],
  limits: { aiMaxLevel: 20, historyMatches: null, onlineSeats: 0 },
} as const;

const PRO_STATS = {
  matchesPlayed: 9,
  competitiveMatches: 5,
  practiceSessions: 3,
  matchesWon: 4,
  winPercentage: 80,
  visits: 94,
  dartsThrown: 250,
  threeDartAverage: 67.45,
  historyLimit: null,
  deep: {
    x01Matches: 4,
    firstNineAverage: 71.25,
    checkoutAttempts: 12,
    checkoutsHit: 5,
    checkoutPercentage: 41.6666666667,
    bestVisit: 140,
    bestLegDarts: 18,
    busts: 2,
    finishingBeds: [
      { segment: 20, hits: 3, share: 75 },
      { segment: 16, hits: 1, share: 25 },
    ],
    unattributedCheckouts: 1,
    recentForm: [
      { completedAt: "2026-08-08T18:00:00.000Z", mode: "x01", result: "lost" },
      { completedAt: "2026-08-09T18:00:00.000Z", mode: "x01", result: "won" },
      { completedAt: "2026-08-10T18:00:00.000Z", mode: "cricket", result: "won" },
      { completedAt: "2026-08-11T18:00:00.000Z", mode: "x01", result: "won" },
      { completedAt: "2026-08-12T18:00:00.000Z", mode: "x01", result: "won" },
    ],
    x01Trend: [
      { completedAt: "2026-08-08T18:00:00.000Z", threeDartAverage: 64.8, checkoutPercentage: 25, result: "lost" },
      { completedAt: "2026-08-09T18:00:00.000Z", threeDartAverage: 68, checkoutPercentage: 33.3333333333, result: "won" },
      { completedAt: "2026-08-11T18:00:00.000Z", threeDartAverage: 70.2, checkoutPercentage: 50, result: "won" },
      { completedAt: "2026-08-12T18:00:00.000Z", threeDartAverage: 72.4, checkoutPercentage: 50, result: "won" },
    ],
    modes: [
      { mode: "x01", played: 4, won: 3, lost: 1, unscored: 0, visits: 38, dartsThrown: 103, winPercentage: 75 },
      { mode: "cricket", played: 2, won: 1, lost: 0, unscored: 1, visits: 13, dartsThrown: 37, winPercentage: 100 },
      { mode: "checkoutLab", played: 1, won: 0, lost: 0, unscored: 1, visits: 12, dartsThrown: 30, winPercentage: null },
      { mode: "doublesMatrix", played: 1, won: 0, lost: 0, unscored: 1, visits: 21, dartsThrown: 50, winPercentage: null },
      { mode: "scoringSprint", played: 1, won: 0, lost: 0, unscored: 1, visits: 10, dartsThrown: 30, winPercentage: null },
    ],
    drills: [
      {
        mode: "checkoutLab", unit: "checkouts", sessions: 1, latest: 7, best: 7, average: 7,
        recent: [{ completedAt: "2026-08-09T18:00:00.000Z", value: 7 }],
      },
      {
        mode: "doublesMatrix", unit: "doubles", sessions: 1, latest: 12, best: 12, average: 12,
        recent: [{ completedAt: "2026-08-08T18:00:00.000Z", value: 12 }],
      },
      {
        mode: "scoringSprint", unit: "points", sessions: 1, latest: 612, best: 612, average: 612,
        recent: [{ completedAt: "2026-08-07T18:00:00.000Z", value: 612 }],
      },
    ],
  },
} as const;

const FREE_STATS = {
  matchesPlayed: 4,
  competitiveMatches: 3,
  practiceSessions: 1,
  matchesWon: 2,
  winPercentage: 66.6666666667,
  visits: 24,
  dartsThrown: 68,
  threeDartAverage: 58.5,
  historyLimit: 50,
  deep: null,
} as const;

const HISTORY = { matches: [
  {
    id: "match-1",
    mode: "x01",
    completedAt: TIMESTAMP,
    players: [
      { seat: 0, displayName: "Lain", isBot: false, botLevel: null, isYou: true },
      { seat: 1, displayName: "Iris", isBot: true, botLevel: 8, isYou: false },
    ],
    winnerSeat: 0,
    turnCount: 8,
    dartCount: 21,
  },
  {
    id: "drill-1",
    mode: "checkoutLab",
    completedAt: "2026-08-09T18:00:00.000Z",
    players: [{ seat: 0, displayName: "Lain", isBot: false, botLevel: null, isYou: true }],
    winnerSeat: null,
    turnCount: 12,
    dartCount: 30,
  },
] } as const;

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Account identity and access are real client flows; only their private HTTP answers are fixed. */
async function mockAccount(page: Page, access: typeof FREE_ACCESS | typeof PRO_ACCESS) {
  await page.route("**/api/auth/get-session", (route) => json(route, 200, {
    user: {
      id: "user-1", createdAt: TIMESTAMP, updatedAt: TIMESTAMP, email: "lain@example.com",
      emailVerified: true, name: "Lain", banned: false,
    },
    session: {
      id: "session-1", createdAt: TIMESTAMP, updatedAt: TIMESTAMP, userId: "user-1",
      expiresAt: "2099-08-12T19:42:00.000Z", token: "browser-test-session",
    },
  }));
  await page.route("**/api/access", (route) => json(route, 200, access));
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("Pro record separates sessions and exposes source-honest career depth", async ({ page }) => {
  await mockAccount(page, PRO_ACCESS);
  await page.route("**/api/stats", (route) => json(route, 200, PRO_STATS));
  await page.route("**/api/matches?*", (route) => json(route, 200, HISTORY));

  await page.goto("/account", { waitUntil: "networkidle" });

  const record = page.getByRole("region", { name: "Your record" });
  await expect(record.getByText("9 completed sessions")).toBeVisible();
  await expect(record.locator("dt", { hasText: /^Competitive$/ }).locator("..")).toContainText("5");
  await expect(record.locator("dt", { hasText: /^Practice$/ }).locator("..")).toContainText("3");
  await expect(record.locator("dt", { hasText: /^Competitive wins$/ }).locator("..")).toContainText("4");
  await expect(record.getByText(/solo drill never becomes a loss/i)).toBeVisible();

  await expect(record.getByRole("heading", { name: "Recent competitive form" })).toBeVisible();
  const recentForm = record.locator(".recent-form-list");
  await expect(recentForm.locator(".stats-result.won")).toHaveCount(4);
  await expect(recentForm.locator(".stats-result.won .sr-only").first()).toHaveText("Won");
  await expect(recentForm.locator(".stats-result.lost")).toHaveCount(1);
  await expect(recentForm.locator(".stats-result.lost .sr-only")).toHaveText("Lost");
  await expect(record.getByRole("table", { name: "Recent X01 performance trend" })).toBeVisible();
  await expect(record.getByRole("table", { name: "Completed sessions by game mode" })).toBeVisible();
  await expect(record.getByRole("table", { name: "Successful exact finishing doubles" })).toContainText("D20");
  await expect(record.getByText(/not aim data or attempt accuracy/i)).toBeVisible();
  await expect(record.getByText(/other \/ unattributed finish/i)).toContainText("1");
  await expect(record.getByText(/aggregate, partial, and non-double finish evidence/i)).toBeVisible();
  await expect(record.getByRole("heading", { name: "Drill progress" })).toBeVisible();
  await expect(record.getByRole("heading", { name: "Checkout Lab" })).toBeVisible();
  await expect(record.getByText("1 session", { exact: true })).toHaveCount(3);
  await expect(record.locator(".history-no-result")).toHaveText("No result");
  await expect(record.locator(".history-no-result")).not.toHaveClass(/history-lost/);

  const replay = record.getByRole("link", { name: /replay x01 match/i });
  expect(await replay.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const restingBackground = await replay.evaluate((element) => getComputedStyle(element).backgroundColor);
  await replay.hover();
  await expect.poll(() => replay.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(restingBackground);
  await replay.focus();
  await expect(replay).toBeFocused();
  expect(await replay.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await expectNoPageOverflow(page);
});

test("Free record receives headline truth and no paid figures", async ({ page }) => {
  await mockAccount(page, FREE_ACCESS);
  await page.route("**/api/stats", (route) => json(route, 200, FREE_STATS));
  await page.route("**/api/matches?*", (route) => json(route, 200, HISTORY));

  await page.goto("/account", { waitUntil: "networkidle" });

  const record = page.getByRole("region", { name: "Your record" });
  await expect(record.getByText("4 completed sessions")).toBeVisible();
  await expect(record.locator("dt", { hasText: /^Competitive$/ }).locator("..")).toContainText("3");
  await expect(record.locator("dt", { hasText: /^Practice$/ }).locator("..")).toContainText("1");
  await expect(record.getByText(/computed on the server and not sent to a Free plan/i)).toBeVisible();
  await expect(record.locator(".stats-depth")).toHaveCount(0);
  await expect(record.getByRole("table")).toHaveCount(0);
  await expect(record.getByText(/most recent 50 completed sessions/i)).toBeVisible();

  const upgrade = record.getByRole("link", { name: "See Pro" });
  expect(await upgrade.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expectNoPageOverflow(page);
});

test("record loading resolves into an honest empty state", async ({ page }) => {
  await mockAccount(page, FREE_ACCESS);
  let releaseStats!: () => void;
  let releaseHistory!: () => void;
  const statsGate = new Promise<void>((resolve) => { releaseStats = resolve; });
  const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve; });
  await page.route("**/api/stats", async (route) => {
    await statsGate;
    await json(route, 200, { ...FREE_STATS, matchesPlayed: 0, competitiveMatches: 0, practiceSessions: 0, matchesWon: 0, winPercentage: 0, visits: 0, dartsThrown: 0, threeDartAverage: 0 });
  });
  await page.route("**/api/matches?*", async (route) => {
    await historyGate;
    await json(route, 200, { matches: [] });
  });

  await page.goto("/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Reading your completed sessions…")).toBeVisible();
  await expect(page.getByText("Loading saved sessions…")).toBeVisible();
  releaseStats();
  releaseHistory();

  await expect(page.getByText(/No finished sessions yet/i)).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  const start = page.getByRole("link", { name: "Start a session" });
  expect(await start.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expectNoPageOverflow(page);
});

test("malformed stats and history failures stay distinct from an empty career", async ({ page }) => {
  await mockAccount(page, FREE_ACCESS);
  await page.route("**/api/stats", (route) => json(route, 200, { ...FREE_STATS, matchesWon: 4 }));
  await page.route("**/api/matches?*", (route) => json(route, 503, { error: "match_history_unavailable" }));

  await page.goto("/account", { waitUntil: "networkidle" });

  await expect(page.getByText(/record could not be read just now/i)).toBeVisible();
  await expect(page.getByText(/History could not be read just now/i)).toBeVisible();
  await expect(page.getByText(/No finished sessions yet/i)).toHaveCount(0);
  await expect(page.getByText("Nothing here yet.")).toHaveCount(0);
  await expectNoPageOverflow(page);
});
