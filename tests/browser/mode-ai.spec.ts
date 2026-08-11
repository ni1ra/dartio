import { expect, test, type Page, type Route } from "@playwright/test";
import type { Aim } from "../../src/domain/ai-throw";
import { representativePoint, type Dart } from "../../src/domain/darts";

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

const FREE_ACCESS = {
  ...PRO_ACCESS,
  effectivePlan: "free",
  accessState: "free",
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 },
};

interface ThrowRequest {
  readonly level: number;
  readonly target: Aim;
}

interface ModeStory {
  readonly name: string;
  readonly mode: string | null;
  readonly path: string;
  readonly targets: readonly Aim[];
  readonly terminal?: boolean;
}

const MODES: readonly ModeStory[] = [
  {
    name: "X01",
    mode: null,
    path: "/play/match?start=501&best=1&in=straight&out=double&opponent=ai",
    targets: [
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
    ],
  },
  {
    name: "Cricket",
    mode: "cricket",
    path: "/play/match?mode=cricket&variant=standard&opponent=ai",
    targets: [
      { segment: 20, multiplier: 3 },
      { segment: 19, multiplier: 3 },
      { segment: 18, multiplier: 3 },
    ],
  },
  {
    name: "Around the Clock",
    mode: "aroundTheClock",
    path: "/play/match?mode=aroundTheClock&opponent=ai",
    targets: [
      { segment: 1, multiplier: 1 },
      { segment: 2, multiplier: 1 },
      { segment: 3, multiplier: 1 },
    ],
  },
  {
    name: "Shanghai",
    mode: "shanghai",
    path: "/play/match?mode=shanghai&opponent=ai",
    targets: [
      { segment: 1, multiplier: 3 },
      { segment: 1, multiplier: 2 },
      { segment: 1, multiplier: 1 },
    ],
    terminal: true,
  },
  {
    name: "Count-Up",
    mode: "countUp",
    path: "/play/match?mode=countUp&opponent=ai",
    targets: [
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
      { segment: 20, multiplier: 3 },
    ],
  },
  {
    name: "Bob's 27",
    mode: "bobs27",
    path: "/play/match?mode=bobs27&opponent=ai",
    targets: [
      { segment: 1, multiplier: 2 },
      { segment: 1, multiplier: 2 },
      { segment: 1, multiplier: 2 },
    ],
  },
];

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

function exactDart(target: Aim): Dart {
  return {
    segment: target.segment,
    multiplier: target.multiplier,
    score: target.segment * target.multiplier,
    ...representativePoint(target),
  };
}

async function mockProAccess(page: Page) {
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
}

async function clearStorageOnce(page: Page) {
  // The session marker makes this a one-shot clear. A later reload must retain
  // the active envelope so the continuation/resume story can test real storage.
  await page.addInitScript(() => {
    const marker = "dartio:browser:storage-cleared";
    if (window.sessionStorage.getItem(marker)) return;
    window.localStorage.clear();
    window.sessionStorage.setItem(marker, "true");
  });
}

async function openFreshMatch(page: Page, path: string, level: 8 | 20) {
  await clearStorageOnce(page);
  await page.goto(`${path}&level=${level}`, { waitUntil: "networkidle" });
  if (level === 20) {
    await expect(page.getByText("PRO AI VERIFIED", { exact: true })).toBeVisible();
  }
}

async function enterPlayerVisit(page: Page) {
  // Singles on 1 settle a visit in every mode without accidentally completing
  // the match or changing the opponent's starting target.
  for (let dart = 0; dart < 3; dart += 1) {
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
  }
}

async function expectSettled(page: Page, story: ModeStory) {
  if (story.terminal) {
    await expect(page.locator(".match-complete")).toContainText("MATCH COMPLETE");
    await expect(page.getByText(/The Navigator wins/i)).toBeVisible();
  } else if (story.mode === null) {
    await expect(page.locator(".score-player").first()).toHaveClass(/active/);
  } else if (story.mode === "cricket") {
    await expect(page.locator(".cricket-turn span").first()).toHaveClass(/active/);
  } else {
    await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  }
}

test("setup reaches all six opponent modes at level 20 without narrow overflow", async ({ page }) => {
  await mockProAccess(page);
  await page.goto("/play", { waitUntil: "networkidle" });

  const mode = page.getByLabel("Game mode");
  const slider = page.getByRole("slider", { name: /AI level, maximum 20/i });
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("20");

  for (const story of MODES) {
    await mode.selectOption(story.mode ?? "x01");
    const href = await page.getByRole("link", { name: /walk to the oche/i }).getAttribute("href");
    const target = new URL(href ?? "", "https://dartio.test");
    expect(target.searchParams.get("mode")).toBe(story.mode);
    expect(target.searchParams.get("opponent")).toBe("ai");
    expect(target.searchParams.get("level")).toBe("20");
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a missing level keeps each surface's intended default instead of becoming level 1", async ({ page }) => {
  await mockProAccess(page);
  await page.goto("/play/match?opponent=ai", { waitUntil: "networkidle" });
  await expect(page.locator(".match-tools > span")).toHaveText("AI level 8");
  await page.goto("/play/match?mode=cricket&opponent=ai", { waitUntil: "networkidle" });
  await expect(page.locator(".match-tools > span")).toHaveText("AI level 5");
  await page.goto("/play/match?mode=countUp&opponent=ai", { waitUntil: "networkidle" });
  await expect(page.locator(".match-tools > span")).toHaveText("AI level 5");
});

for (const story of MODES) {
  test(`level 20 ${story.name} chooses each target on the client and commits once`, async ({ page }) => {
    await mockProAccess(page);
    const requests: ThrowRequest[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route("**/api/ai/throw", async (route) => {
      const input = route.request().postDataJSON() as ThrowRequest;
      requests.push(input);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // A real wait makes accidental Promise.all orchestration observable.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await json(route, 200, { dart: exactDart(input.target) });
      inFlight -= 1;
    });

    await openFreshMatch(page, story.path, 20);
    await enterPlayerVisit(page);
    await expectSettled(page, story);

    expect(requests).toEqual(story.targets.map((target) => ({ level: 20, target })));
    expect(maxInFlight).toBe(1);
    // The old stale-timer bug queued another visit after the first one settled.
    await page.waitForTimeout(1_000);
    expect(requests).toHaveLength(3);
  });

  test(`level 8 ${story.name} remains local with the premium route unavailable`, async ({ page }) => {
    await mockProAccess(page);
    let requests = 0;
    await page.route("**/api/ai/throw", (route) => {
      requests += 1;
      return json(route, 503, { error: "should_not_be_called" });
    });

    await openFreshMatch(page, story.path, 8);
    await enterPlayerVisit(page);
    await expectSettled(page, { ...story, terminal: false });
    expect(requests).toBe(0);
  });
}

test("a held third response leaves Count-Up untouched until one atomic commit", async ({ page }) => {
  await mockProAccess(page);
  const requests: ThrowRequest[] = [];
  let releaseThird!: () => void;
  const thirdGate = new Promise<void>((resolve) => { releaseThird = resolve; });
  await page.route("**/api/ai/throw", async (route) => {
    const input = route.request().postDataJSON() as ThrowRequest;
    requests.push(input);
    if (requests.length === 3) await thirdGate;
    await json(route, 200, { dart: exactDart(input.target) });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect.poll(() => requests.length).toBe(3);

  const opponentTotal = page.locator(".round-totals li").nth(1).locator("strong");
  await expect(opponentTotal).toHaveText("0");
  releaseThird();
  await expect(opponentTotal).toHaveText("180");
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
});

test("a failed second dart mutates nothing and Retry restarts the whole visit", async ({ page }) => {
  await mockProAccess(page);
  const requests: ThrowRequest[] = [];
  let refused = false;
  await page.route("**/api/ai/throw", async (route) => {
    const input = route.request().postDataJSON() as ThrowRequest;
    requests.push(input);
    if (!refused && requests.length === 2) {
      refused = true;
      await json(route, 503, { error: "access_status_unavailable" });
      return;
    }
    await json(route, 200, { dart: exactDart(input.target) });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect(page.getByText(/AI visit paused · no score changed/i)).toBeVisible();
  expect(requests).toHaveLength(2);
  await expect(page.locator(".round-totals li").nth(1).locator("strong")).toHaveText("0");

  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.locator(".round-totals li").nth(1).locator("strong")).toHaveText("180");
  expect(requests).toHaveLength(5);
});

test("Continue at level 8 remains local after reload without another server request", async ({ page }) => {
  await mockProAccess(page);
  let requests = 0;
  await page.route("**/api/ai/throw", async (route) => {
    requests += 1;
    if (requests === 2) {
      await json(route, 503, { error: "access_status_unavailable" });
      return;
    }
    const input = route.request().postDataJSON() as ThrowRequest;
    await json(route, 200, { dart: exactDart(input.target) });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect(page.getByText(/AI visit paused · no score changed/i)).toBeVisible();
  await page.getByRole("button", { name: /continue at level 8/i }).click();
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(requests).toBe(2);
  await expect(page.getByText("LEVEL 8 CONTINUATION", { exact: true })).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("LEVEL 8 CONTINUATION", { exact: true })).toBeVisible();
  await expect(page.locator(".match-notice")).toContainText("Resumed the match");
  await enterPlayerVisit(page);
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(requests).toBe(2);
});

test("X01 and Cricket keep different requested AI levels in different resume slots", async ({ page }) => {
  await mockProAccess(page);
  const scopedModes = MODES.filter((story) => story.mode === null || story.mode === "cricket");

  for (const story of scopedModes) {
    await openFreshMatch(page, story.path, 8);
    await enterPlayerVisit(page);
    await expectSettled(page, story);

    await page.goto(`${story.path}&level=20`, { waitUntil: "networkidle" });
    await expect(page.getByText("PRO AI VERIFIED", { exact: true })).toBeVisible();
    await expect(page.locator(".match-notice")).toHaveCount(0);
    if (story.mode === null) {
      await expect(page.locator(".score-player.opponent strong")).toHaveText("501");
    } else {
      await expect(page.locator(".cricket-board tbody tr td:last-child").filter({ hasText: /.+/ })).toHaveCount(0);
    }
  }
});

test("an initially unentitled level 20 request falls back honestly and stays local", async ({ page }) => {
  let upgraded = false;
  await page.route("**/api/access", (route) => json(route, 200, upgraded ? PRO_ACCESS : FREE_ACCESS));
  let requests = 0;
  await page.route("**/api/ai/throw", (route) => {
    requests += 1;
    return json(route, 503, { error: "should_not_be_called" });
  });
  await clearStorageOnce(page);
  await page.goto("/play/match?mode=countUp&opponent=ai&level=20", { waitUntil: "networkidle" });
  await expect(page.getByText("PRO REQUIRED", { exact: true })).toBeVisible();
  await expect(page.locator(".match-tools > span")).toHaveText("AI level 8");

  await enterPlayerVisit(page);
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(requests).toBe(0);

  // Once the fallback has completed a visit, that execution level belongs to
  // the active match. A later entitlement must not silently upgrade it on reload.
  upgraded = true;
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("LEVEL 8 CONTINUATION", { exact: true })).toBeVisible();
  await enterPlayerVisit(page);
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(requests).toBe(0);
});

test("an unavailable initial access check also falls back locally without a paid request", async ({ page }) => {
  await page.route("**/api/access", (route) => json(route, 503, { error: "access_status_unavailable" }));
  let requests = 0;
  await page.route("**/api/ai/throw", (route) => {
    requests += 1;
    return json(route, 503, { error: "should_not_be_called" });
  });
  await clearStorageOnce(page);
  await page.goto("/play/match?mode=countUp&opponent=ai&level=20", { waitUntil: "networkidle" });
  await expect(page.getByText("VERIFICATION UNAVAILABLE", { exact: true })).toBeVisible();
  await expect(page.locator(".match-tools > span")).toHaveText("AI level 8");

  await enterPlayerVisit(page);
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(requests).toBe(0);
});

test("a mid-visit authorization refusal holds the score and Check again restarts cleanly", async ({ page }) => {
  await mockProAccess(page);
  let requests = 0;
  await page.route("**/api/ai/throw", async (route) => {
    requests += 1;
    if (requests === 1) {
      await json(route, 403, { error: "advanced_ai_required", maxLevel: 8 });
      return;
    }
    const input = route.request().postDataJSON() as ThrowRequest;
    await json(route, 200, { dart: exactDart(input.target) });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect(page.locator(".ai-access-recovery")).toContainText(/could not authorize/i);
  await expect(page.locator(".round-totals li").nth(1).locator("strong")).toHaveText("0");
  expect(requests).toBe(1);

  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(page.locator(".round-totals li").nth(1).locator("strong")).toHaveText("180");
  expect(requests).toBe(4);
});

test("Check again cannot silently choose level 8 when refreshed access stays Free", async ({ page }) => {
  let accessRequests = 0;
  await page.route("**/api/access", (route) => {
    accessRequests += 1;
    return json(route, 200, accessRequests === 1 ? PRO_ACCESS : FREE_ACCESS);
  });
  let throwRequests = 0;
  await page.route("**/api/ai/throw", (route) => {
    throwRequests += 1;
    return json(route, 403, { error: "advanced_ai_required", maxLevel: 8 });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(page.getByText("PRO REQUIRED", { exact: true })).toBeVisible();
  await page.waitForTimeout(800);

  await expect(page.locator(".round-totals li").nth(1).locator("strong")).toHaveText("0");
  await expect(page.locator(".round-totals li").first()).not.toHaveClass(/active/);
  expect(throwRequests).toBe(1);

  await page.getByRole("button", { name: /continue at level 8/i }).click();
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);
  expect(throwRequests).toBe(1);
});

test("a late Check again result cannot overwrite an explicit level 8 continuation", async ({ page }) => {
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let accessRequests = 0;
  await page.route("**/api/access", async (route) => {
    accessRequests += 1;
    if (accessRequests === 2) await refreshGate;
    await json(route, 200, accessRequests === 1 ? PRO_ACCESS : FREE_ACCESS);
  });
  let throwRequests = 0;
  await page.route("**/api/ai/throw", (route) => {
    throwRequests += 1;
    return json(route, 403, { error: "advanced_ai_required", maxLevel: 8 });
  });

  await openFreshMatch(page, "/play/match?mode=countUp&opponent=ai", 20);
  await enterPlayerVisit(page);
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect.poll(() => accessRequests).toBe(2);
  await page.getByRole("button", { name: /continue at level 8/i }).click();
  await expect(page.locator(".round-totals li").first()).toHaveClass(/active/);

  releaseRefresh();
  await expect(page.getByText("LEVEL 8 CONTINUATION", { exact: true })).toBeVisible();
  await expect(page.locator(".ai-access-recovery")).toHaveCount(0);
  expect(throwRequests).toBe(1);
});

test("opening X01 correction aborts a held request and rejects its stale result", async ({ page }) => {
  await mockProAccess(page);
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/ai/throw", async (route) => {
    requests += 1;
    const input = route.request().postDataJSON() as ThrowRequest;
    await gate;
    try {
      await json(route, 200, { dart: exactDart(input.target) });
    } catch {
      // Chromium may discard the intercepted request as soon as AbortController
      // fires. Either outcome is acceptable; neither may append the landing.
    }
  });

  await openFreshMatch(page, "/play/match?start=501&best=1&in=straight&out=double&opponent=ai", 20);
  await enterPlayerVisit(page);
  await expect.poll(() => requests).toBe(1);
  await page.getByRole("button", { name: /correct last dart/i }).click();
  await expect(page.getByRole("dialog", { name: /correct a visit/i })).toBeVisible();
  release();

  await page.waitForTimeout(800);
  await expect(page.locator(".score-player.opponent strong")).toHaveText("501");
  expect(requests).toBe(1);
});

test("round practice remains solo when no opponent is requested", async ({ page }) => {
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  await expect(page.getByText("The Navigator")).toHaveCount(0);
});
