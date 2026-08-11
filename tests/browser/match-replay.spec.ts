import { expect, test, type Page, type Route } from "@playwright/test";

const EXACT_RECORD = {
  mode: "x01",
  options: { startingScore: 501, outRule: "double" },
  players: [
    { seat: 0, displayName: "Lain", isBot: false },
    { seat: 1, displayName: "Iris", isBot: true, botLevel: 8 },
  ],
  turns: [
    {
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 501,
      scoreAfter: 401,
      bust: false,
      dartsThrown: 2,
      darts: [
        { ordinal: 1, segment: 20, multiplier: 3, x: 0, y: -0.61 },
        { ordinal: 2, segment: 20, multiplier: 2, x: 0.2, y: -0.96 },
      ],
    },
    {
      seat: 1,
      turnNumber: 2,
      legNumber: 1,
      scoreBefore: 501,
      scoreAfter: 441,
      bust: false,
      dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 3 }],
    },
  ],
  winnerSeat: 0,
} as const;

const AGGREGATE_RECORD = {
  mode: "future-mode",
  options: { futureRule: true },
  players: [{ seat: 0, displayName: "Lain", isBot: false }],
  turns: [{
    seat: 0,
    turnNumber: 4,
    legNumber: 2,
    scoreBefore: 40,
    scoreAfter: 40,
    bust: true,
    dartsThrown: 3,
    aggregateScore: 60,
    darts: [],
  }],
} as const;

const ONE_DART_RECORD = {
  mode: "x01",
  options: { startingScore: 40, outRule: "double" },
  players: [{ seat: 0, displayName: "Lain", isBot: false }],
  turns: [{
    seat: 0,
    turnNumber: 1,
    legNumber: 1,
    scoreBefore: 40,
    scoreAfter: 0,
    bust: false,
    dartsThrown: 1,
    darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
  }],
  winnerSeat: 0,
} as const;

const LEG_RESET_RECORD = {
  mode: "x01",
  options: { startingScore: 501, legsToWin: 2, outRule: "double" },
  players: [{ seat: 0, displayName: "Lain", isBot: false }],
  turns: [
    {
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    },
    {
      seat: 0,
      turnNumber: 2,
      legNumber: 2,
      scoreBefore: 501,
      scoreAfter: 441,
      bust: false,
      dartsThrown: 2,
      darts: [
        { ordinal: 1, segment: 20, multiplier: 3 },
        { ordinal: 2, segment: 0, multiplier: 1 },
      ],
    },
  ],
} as const;

const EXACT_BUST_RECORD = {
  mode: "x01",
  options: { startingScore: 30, outRule: "double" },
  players: [{ seat: 0, displayName: "Lain", isBot: false }],
  turns: [{
    seat: 0,
    turnNumber: 1,
    legNumber: 1,
    scoreBefore: 30,
    scoreAfter: 30,
    bust: true,
    dartsThrown: 2,
    darts: [
      { ordinal: 1, segment: 20, multiplier: 1 },
      { ordinal: 2, segment: 20, multiplier: 1 },
    ],
  }],
} as const;

const FREE_ACCESS = {
  auth: "authenticated",
  effectivePlan: "free",
  accessState: "free",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 },
  availability: {
    localScoring: "implemented",
    advancedAi: "implemented",
    advancedCheckout: "implemented",
    voiceInput: "implemented",
    history: "implemented",
    deepStats: "implemented",
    onlineMultiplayer: "implemented",
    customPractice: "coming_soon",
    clubManagement: "coming_soon",
  },
};

type BrowserRecord = typeof EXACT_RECORD | typeof AGGREGATE_RECORD | typeof ONE_DART_RECORD | typeof LEG_RESET_RECORD | typeof EXACT_BUST_RECORD;

function replayPayload(id: string, record: BrowserRecord = EXACT_RECORD) {
  return { match: { id, completedAt: "2026-08-11T19:42:00.000Z", ownerSeat: 0, record } };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockReplay(page: Page, id: string, record: BrowserRecord = EXACT_RECORD) {
  await page.route(`**/api/matches/${id}`, (route) => json(route, 200, replayPayload(id, record)));
}

/** All replay controls and state are real React/browser behaviour; only the private HTTP response is fixed. */
test("loads an exact replay, keeps the board passive, and drives every frame accessibly", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/matches/exact", async (route) => {
    await gate;
    await json(route, 200, replayPayload("exact"));
  });

  await page.goto("/account/matches/exact", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Reading the stored visits…")).toBeVisible();
  release();

  const board = page.getByRole("img", { name: /replay dartboard/i });
  await expect(board).toBeVisible();
  await expect(board).not.toHaveAttribute("tabindex");
  await expect(board).not.toHaveAttribute("aria-disabled");
  await expect(board).toHaveAttribute("data-read-only", "true");
  await expect(page.locator(".throw-mark")).toHaveCount(1);
  await expect(page.locator(".replay-progress")).toContainText("Frame 1 of 3");
  await expect(page.locator(".replay-frame-facts")).toContainText("501 · pending visit");

  // A replay board looks like the regulation scorer but has no scoring event path.
  await board.click({ position: { x: 160, y: 160 } });
  await expect(page.locator(".replay-progress")).toContainText("Frame 1 of 3");
  await expect(page.locator(".throw-mark")).toHaveCount(1);

  const next = page.getByRole("button", { name: "Next dart" });
  await next.click();
  await expect(page.locator(".replay-progress")).toContainText("Frame 2 of 3");
  await expect(page.locator(".throw-mark")).toHaveCount(2);
  await expect(page.locator(".replay-frame-facts")).toContainText("501 → 401");

  await page.locator(".replay-heading h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".replay-progress")).toContainText("Frame 3 of 3");
  await expect(page.locator(".throw-mark")).toHaveCount(1);
  await expect(page.locator(".replay-frame-head")).toContainText("Iris");
  await page.keyboard.press("Home");
  await expect(page.locator(".replay-progress")).toContainText("Frame 1 of 3");

  const play = page.locator(".replay-play");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".replay-progress")).toContainText("Frame 2 of 3");
  await expect(play).toHaveText("Pause");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1_000);
  await expect(page.locator(".replay-progress")).toContainText("Frame 2 of 3");

  await play.click();
  await expect(page.locator(".replay-progress")).toContainText("Frame 3 of 3");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(play).toHaveText("Play");

  const controlBoxes = await page.locator(".replay-transport button").evaluateAll((controls) => controls.map((control) => {
    const box = control.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(controlBoxes.every(({ width, height }) => width >= 44 && height >= 44), JSON.stringify(controlBoxes)).toBe(true);

  const previous = page.getByRole("button", { name: "Previous dart" });
  await previous.focus();
  await page.keyboard.press("Tab");
  await expect(play).toBeFocused();
  const focus = await play.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(focus.style).not.toBe("none");
  expect(focus.width).toBeGreaterThan(0);

  const backHeight = await page.locator(".replay-back").evaluate((element) => element.getBoundingClientRect().height);
  expect(backHeight).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("keeps an aggregate visit marker-free and withholds its result until the final dart", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockReplay(page, "aggregate", AGGREGATE_RECORD);
  await page.goto("/account/matches/aggregate", { waitUntil: "networkidle" });

  await expect(page.getByText("future-mode", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Landing unknown", { exact: true })).toBeVisible();
  await expect(page.locator(".replay-landing")).toContainText("no stored bed or coordinate");
  await expect(page.locator(".replay-landing")).toContainText("a 60-point total");
  await expect(page.locator(".replay-bust")).toHaveCount(0);
  await expect(page.locator(".throw-mark")).toHaveCount(0);
  await expect(page.locator(".replay-frame-facts")).toContainText("40 · pending visit");
  await expect(page.locator(".replay-bust")).toHaveCount(0);

  // Reduced-motion users are never moved through history without pressing Play.
  await page.waitForTimeout(1_000);
  await expect(page.locator(".replay-progress")).toContainText("Frame 1 of 3");

  await page.getByRole("button", { name: "Next dart" }).click();
  await expect(page.locator(".replay-progress")).toContainText("Frame 2 of 3");
  await expect(page.locator(".throw-mark")).toHaveCount(0);
  await expect(page.locator(".replay-frame-facts")).toContainText("40 · pending visit");
  await expect(page.locator(".replay-bust")).toHaveCount(0);

  await page.getByRole("button", { name: "Next dart" }).click();
  await expect(page.locator(".replay-progress")).toContainText("Frame 3 of 3");
  await expect(page.locator(".replay-frame-facts")).toContainText("40 → 40");
  await expect(page.locator(".throw-mark")).toHaveCount(0);
  await expect(page.locator(".replay-bust")).toHaveText("BUST · The stored visit was recorded as a bust.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("reveals an exact visit's bust only on the resolving dart", async ({ page }) => {
  await mockReplay(page, "exact-bust", EXACT_BUST_RECORD);
  await page.goto("/account/matches/exact-bust", { waitUntil: "networkidle" });

  await expect(page.locator(".replay-frame-facts")).toContainText("30 · pending visit");
  await expect(page.locator(".replay-bust")).toHaveCount(0);
  await page.getByRole("button", { name: "Next dart" }).click();
  await expect(page.locator(".replay-frame-facts")).toContainText("30 → 30");
  await expect(page.locator(".replay-bust")).toHaveText("BUST · The stored visit was recorded as a bust.");
});

test("a one-dart finish cannot enter a stuck playing state", async ({ page }) => {
  await mockReplay(page, "one-dart", ONE_DART_RECORD);
  await page.goto("/account/matches/one-dart", { waitUntil: "networkidle" });

  const play = page.getByRole("button", { name: "Replay has one dart" });
  await expect(play).toBeDisabled();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".replay-progress")).toContainText("Frame 1 of 1");
  await expect(page.locator(".replay-frame-facts")).toContainText("40 → 0");
});

test("the active seat uses the new leg's stored opening score before its visit resolves", async ({ page }) => {
  await mockReplay(page, "leg-reset", LEG_RESET_RECORD);
  await page.goto("/account/matches/leg-reset", { waitUntil: "networkidle" });

  await expect(page.locator(".replay-scoreboard strong")).toHaveText("0");
  await page.getByRole("button", { name: "Next dart" }).click();
  await expect(page.locator(".replay-frame-facts")).toContainText("Leg2");
  await expect(page.locator(".replay-frame-facts")).toContainText("501 · pending visit");
  await expect(page.locator(".replay-scoreboard strong")).toHaveText("501");

  await page.getByRole("button", { name: "Next dart" }).click();
  await expect(page.locator(".replay-scoreboard strong")).toHaveText("441");
});

test("a signed-out replay offers sign-in and a full-size route back", async ({ page }) => {
  await page.route("**/api/matches/private", (route) => json(route, 401, { error: "authentication_required" }));
  await page.goto("/account/matches/private", { waitUntil: "networkidle" });

  await expect(page.getByText("This record belongs behind your account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in securely" })).toHaveAttribute("href", "/auth/sign-in");
  await expect(page.getByRole("link", { name: "Back to your record" })).toHaveAttribute("href", "/account");
  const heights = await page.locator(".replay-state-actions a").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
  expect(heights.every((height) => height >= 44), JSON.stringify(heights)).toBe(true);
});

test("a missing or unowned replay stays private and returns to the record", async ({ page }) => {
  await page.route("**/api/matches/missing", (route) => json(route, 404, { error: "match_not_found" }));
  await page.goto("/account/matches/missing", { waitUntil: "networkidle" });

  await expect(page.getByText("That replay is not in your record.")).toBeVisible();
  await expect(page.getByText(/belong to another account/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your record" })).toHaveAttribute("href", "/account");
});

test("a temporary read failure retries into the real replay", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/matches/retry", (route) => {
    calls += 1;
    return calls === 1
      ? json(route, 503, { error: "match_history_unavailable" })
      : json(route, 200, replayPayload("retry"));
  });
  await page.goto("/account/matches/retry", { waitUntil: "networkidle" });

  await expect(page.getByText("The record could not be read just now.")).toBeVisible();
  await page.getByRole("button", { name: "Try replay again" }).click();
  await expect(page.getByRole("img", { name: /replay dartboard/i })).toBeVisible();
  expect(calls).toBe(2);
});

test("recent history links directly into the matching replay", async ({ page }) => {
  const timestamp = "2026-08-11T19:42:00.000Z";
  await page.route("**/api/auth/get-session", (route) => json(route, 200, {
    user: {
      id: "user-1", createdAt: timestamp, updatedAt: timestamp, email: "lain@example.com",
      emailVerified: true, name: "Lain", banned: false,
    },
    session: {
      id: "session-1", createdAt: timestamp, updatedAt: timestamp, userId: "user-1",
      expiresAt: "2099-08-12T19:42:00.000Z", token: "browser-test-session",
    },
  }));
  await page.route("**/api/access", (route) => json(route, 200, FREE_ACCESS));
  await page.route("**/api/stats", (route) => json(route, 200, {
    matchesPlayed: 1, matchesWon: 1, winPercentage: 100, visits: 2, dartsThrown: 3,
    threeDartAverage: 100, historyLimit: 50, deep: null,
  }));
  await page.route("**/api/matches?*", (route) => json(route, 200, { matches: [{
    id: "history-1", mode: "x01", completedAt: timestamp,
    players: [
      { seat: 0, displayName: "Lain", isBot: false, botLevel: null, isYou: true },
      { seat: 1, displayName: "Iris", isBot: true, botLevel: 8, isYou: false },
    ],
    winnerSeat: 0, turnCount: 2, dartCount: 3,
  }] }));
  await page.route("**/api/matches/history-1", (route) => json(route, 200, replayPayload("history-1")));

  await page.goto("/account", { waitUntil: "networkidle" });
  const replay = page.getByRole("link", { name: /replay x01 match from/i });
  await expect(replay).toHaveAttribute("href", "/account/matches/history-1");
  expect(await replay.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await replay.click();
  await expect(page).toHaveURL(/\/account\/matches\/history-1$/);
  await expect(page.getByRole("img", { name: /replay dartboard/i })).toBeVisible();
});
