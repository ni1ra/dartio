import { expect, test, type Page, type Route } from "@playwright/test";

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

/**
 * Gives the browser a deterministic authenticated room while leaving the real UI,
 * client schemas, mutations, refresh, and responsive layout in the story.
 */
async function mockHostedRoom(page: Page, { finishingVisit = false } = {}) {
  let room = {
    code: "OCHE42",
    mode: "x01",
    options: { startingScore: finishingVisit ? 40 : 501, legsToWin: finishingVisit ? 1 : 3, setsToWin: 1, inRule: "straight", outRule: "double" },
    status: "active",
    version: 0,
    yourSeat: 0,
    yourRole: "owner",
    watching: 1,
    seats: [
      { seat: 0, displayName: "Host", isYou: true, role: "owner" },
      { seat: 1, displayName: "Guest", isYou: false, role: "player" },
    ],
    turns: finishingVisit ? [{
      turnNumber: 1,
      seat: 0,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    }] : [],
  };
  const handoverBodies: unknown[] = [];
  const closeBodies: unknown[] = [];
  let releaseHandover!: () => void;
  let releaseClose!: () => void;
  const handoverGate = new Promise<void>((resolve) => { releaseHandover = resolve; });
  const closeGate = new Promise<void>((resolve) => { releaseClose = resolve; });
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
  await page.route("**/api/rooms**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/rooms" && request.method() === "POST") {
      await json(route, 201, { code: room.code, seat: 0 });
      return;
    }
    if (path === `/api/rooms/${room.code}` && request.method() === "GET") {
      await json(route, 200, room);
      return;
    }
    if (path === `/api/rooms/${room.code}/handover` && request.method() === "POST") {
      handoverBodies.push(request.postDataJSON());
      await handoverGate;
      room = {
        ...room,
        yourRole: "player",
        seats: [
          { ...room.seats[0]!, role: "player" },
          { ...room.seats[1]!, role: "owner" },
        ],
      };
      await json(route, 200, { code: room.code, hostSeat: 1 });
      return;
    }
    if (path === `/api/rooms/${room.code}/close` && request.method() === "POST") {
      closeBodies.push(request.postDataJSON());
      await closeGate;
      room = { ...room, status: "abandoned" };
      await json(route, 200, { alreadyClosed: false });
      return;
    }
    await json(route, 404, { error: "unexpected_room_request" });
  });

  await page.goto("/friends", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /open a room/i }).click();
  await expect(page.getByText("OCHE42", { exact: true })).toBeVisible();

  return { handoverBodies, closeBodies, releaseHandover, releaseClose };
}

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

test("the host can hand over once, without a second owner or narrow-screen overflow", async ({ page }) => {
  const room = await mockHostedRoom(page);
  const makeHost = page.getByRole("button", { name: /make host/i });
  const close = page.getByRole("button", { name: /close room/i });

  await makeHost.click();
  await expect(makeHost).toBeDisabled();
  await expect(close).toBeDisabled();
  room.releaseHandover();

  await expect(page.locator(".room-seats small")).toHaveText(["player", "owner"]);
  await expect(page.getByRole("button", { name: /make host/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /close room/i })).toHaveCount(0);
  expect(room.handoverBodies).toEqual([{ toSeat: 1 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("closing withdraws every host action and the match scoring pad", async ({ page }) => {
  // The stored visit already finishes the replay, modelling close winning before
  // the client reports completion. Canonical server status must still own the UI.
  const room = await mockHostedRoom(page, { finishingVisit: true });
  const close = page.getByRole("button", { name: /close room/i });

  await close.click();
  await expect(close).toBeDisabled();
  await expect(page.getByRole("button", { name: /make host/i })).toBeDisabled();
  room.releaseClose();

  await expect(page.getByText(/the host closed this room\. nothing more will be thrown in it/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /close room/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /make host/i })).toHaveCount(0);
  expect(room.closeBodies).toEqual([{}]);

  await page.getByRole("link", { name: /go to the oche/i }).click();
  await expect(page.getByText(/room closed · oche42/i)).toBeVisible();
  await expect(page.getByText("MATCH COMPLETE", { exact: true })).toHaveCount(0);
  await expect(page.locator(".score-player.active")).toHaveCount(0);
  await expect(page.locator(".dartboard")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".dart-input-pad")).toHaveCount(0);
});
