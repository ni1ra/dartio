import { gotoDartio } from "./navigation";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { FiledTurn, RoomStateView } from "../../src/lib/product/rooms-client";

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
    customPractice: "implemented",
    clubManagement: "coming_soon",
  },
};

type RoomContext = {
  readonly route: Route;
  readonly count: number;
  readonly room: RoomStateView;
  readonly setRoom: (room: RoomStateView) => void;
  readonly json: (status: number, body: unknown) => Promise<void>;
};

type TurnContext = Omit<RoomContext, "count"> & { readonly input: FiledTurn; readonly attempt: number };
type CompleteContext = Omit<RoomContext, "count"> & { readonly winnerSeat: number | null; readonly attempt: number };

type RoomBehavior = {
  readonly initial?: RoomStateView;
  readonly onRead?: (context: RoomContext) => Promise<boolean>;
  readonly onTurn?: (context: TurnContext) => Promise<boolean>;
  readonly onComplete?: (context: CompleteContext) => Promise<boolean>;
};

const baseRoom = (overrides: Partial<RoomStateView> = {}): RoomStateView => ({
  code: "OCHE42",
  mode: "x01",
  options: { startingScore: 501, legsToWin: 3, setsToWin: 1, inRule: "straight", outRule: "double" },
  status: "active",
  version: 0,
  yourSeat: 0,
  yourRole: "owner",
  watching: 0,
  seats: [
    { seat: 0, displayName: "Host", isYou: true, role: "owner" },
    { seat: 1, displayName: "Guest", isYou: false, role: "player" },
  ],
  turns: [],
  ...overrides,
});

/** Turns one accepted request into the same authoritative shape returned by GET. */
function appendAcceptedTurn(room: RoomStateView, input: FiledTurn): RoomStateView {
  const version = input.expectedVersion + 1;
  return {
    ...room,
    version,
    turns: [...room.turns, {
      version,
      turnNumber: version,
      seat: input.seat,
      ...input.turn,
      darts: input.turn.darts.map(({ ordinal, segment, multiplier }) => ({ ordinal, segment, multiplier })),
    }],
  };
}

async function installRoom(page: Page, behavior: RoomBehavior = {}) {
  let room = behavior.initial ?? baseRoom();
  let reads = 0;
  let turns = 0;
  let completes = 0;
  const filed: FiledTurn[] = [];

  await page.route("**/api/access", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(PRO_ACCESS),
  }));
  await page.route("**/api/rooms/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const setRoom = (next: RoomStateView) => { room = next; };
    const json = (status: number, body: unknown) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/api/rooms/OCHE42" && request.method() === "GET") {
      reads += 1;
      if (behavior.onRead && await behavior.onRead({ route, count: reads, room, setRoom, json })) return;
      await json(200, room);
      return;
    }
    if (path === "/api/rooms/OCHE42/turns" && request.method() === "POST") {
      turns += 1;
      const input = request.postDataJSON() as FiledTurn;
      filed.push(input);
      if (behavior.onTurn && await behavior.onTurn({ route, input, attempt: turns, room, setRoom, json })) return;
      room = appendAcceptedTurn(room, input);
      await json(200, { version: room.version });
      return;
    }
    if (path === "/api/rooms/OCHE42/complete" && request.method() === "POST") {
      completes += 1;
      const input = request.postDataJSON() as { winnerSeat: number | null };
      if (behavior.onComplete && await behavior.onComplete({ route, winnerSeat: input.winnerSeat, attempt: completes, room, setRoom, json })) return;
      const alreadyComplete = room.status === "complete";
      room = { ...room, status: "complete" };
      await json(200, { alreadyComplete });
      return;
    }
    await json(404, { error: "unexpected_room_request" });
  });

  return {
    filed,
    reads: () => reads,
    turns: () => turns,
    completes: () => completes,
    room: () => room,
    setRoom: (next: RoomStateView) => { room = next; },
  };
}

async function openRoom(page: Page) {
  await gotoDartio(page, "/play/match?room=OCHE42");
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toBeEnabled();
}

async function throwTrebleVisit(page: Page) {
  const input = page.getByRole("button", { name: "Treble 20, 60 points" });
  await input.click();
  await input.click();
  await input.click();
}

test("a visit whose response was lost is confirmed once from the room record", async ({ page }) => {
  const harness = await installRoom(page, {
    onTurn: async ({ route, input, room, setRoom }) => {
      setRoom(appendAcceptedTurn(room, input));
      await route.abort("connectionreset");
      return true;
    },
  });
  await openRoom(page);
  await throwTrebleVisit(page);

  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("321");
  await expect(page.getByText("Visit confirmed from the room record.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /retry held visit|check room/i })).toHaveCount(0);
  expect(harness.turns()).toBe(1);
  expect(harness.filed).toHaveLength(1);
  expect(harness.room().turns).toHaveLength(1);
});

test("an unchanged room offers one explicit retry and never duplicates the visit", async ({ page }) => {
  const harness = await installRoom(page, {
    onTurn: async ({ route, input, attempt, room, setRoom, json }) => {
      if (attempt === 1) {
        await route.abort("connectionreset");
        return true;
      }
      setRoom(appendAcceptedTurn(room, input));
      await json(200, { version: input.expectedVersion + 1 });
      return true;
    },
  });
  await openRoom(page);
  await throwTrebleVisit(page);

  const retry = page.getByRole("button", { name: "Retry held visit" });
  await expect(retry).toBeVisible();
  await expect(page.locator(".dart-input-pad")).toHaveAttribute("disabled", "");
  await retry.click();

  await expect(page.locator(".score-player").first().locator("strong")).toHaveText("321");
  await expect(retry).toHaveCount(0);
  expect(harness.turns()).toBe(2);
  expect(harness.room().turns).toHaveLength(1);
  expect(harness.filed[0]).toEqual(harness.filed[1]);
});

test("four failed reads pause scoring until an explicit reconnect succeeds", async ({ page }) => {
  const harness = await installRoom(page, {
    onRead: async ({ route, count }) => {
      if (count >= 2 && count <= 5) {
        await route.abort("connectionreset");
        return true;
      }
      return false;
    },
  });
  await openRoom(page);

  const reconnect = page.getByRole("button", { name: "Reconnect" });
  await expect(reconnect).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toBeDisabled();
  await page.waitForTimeout(2_300);
  expect(harness.reads()).toBe(5);
  await reconnect.click();
  await expect(reconnect).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Treble 20, 60 points" })).toBeEnabled();
  expect(harness.turns()).toBe(0);
  expect(harness.reads()).toBeGreaterThanOrEqual(6);
});

test("a lost finish response is recovered by one idempotent confirmation", async ({ page }) => {
  const finishing = baseRoom({
    options: { startingScore: 40, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" },
    version: 1,
    turns: [{
      version: 1,
      turnNumber: 1,
      seat: 0,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    }],
  });
  const harness = await installRoom(page, {
    initial: finishing,
    onComplete: async ({ route, attempt, room, setRoom, json }) => {
      if (attempt === 1) {
        setRoom({ ...room, status: "complete" });
        await route.abort("connectionreset");
        return true;
      }
      await json(200, { alreadyComplete: true });
      return true;
    },
  });
  await gotoDartio(page, "/play/match?room=OCHE42");

  const confirm = page.getByRole("button", { name: "Confirm finish" });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("MATCH COMPLETE", { exact: true })).toBeVisible();
  await expect(page.locator(".dart-input-pad")).toHaveCount(0);
  expect(harness.completes()).toBe(2);
});

test("canonical close wins a finish race and stale scoring never returns", async ({ page }) => {
  let finishStarted!: () => void;
  let releaseFinish!: () => void;
  let staleCompleteDelivered!: () => void;
  let deliveredStaleComplete = false;
  const started = new Promise<void>((resolve) => { finishStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseFinish = resolve; });
  const staleComplete = new Promise<void>((resolve) => { staleCompleteDelivered = resolve; });
  const finishing = baseRoom({
    options: { startingScore: 40, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" },
    version: 1,
    turns: [{
      version: 1,
      turnNumber: 1,
      seat: 0,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    }],
  });
  const harness = await installRoom(page, {
    initial: finishing,
    onRead: async ({ count, room, json }) => {
      // The first post-race read establishes abandonment. A later poll then
      // models a delayed edge response from before close at the same visit
      // version; it cannot resurrect the completion label.
      if (!deliveredStaleComplete && count >= 3 && room.status === "abandoned") {
        deliveredStaleComplete = true;
        await json(200, { ...room, status: "complete" });
        staleCompleteDelivered();
        return true;
      }
      return false;
    },
    onComplete: async ({ json }) => {
      finishStarted();
      await release;
      await json(409, { error: "room_closed" });
      return true;
    },
  });
  await gotoDartio(page, "/play/match?room=OCHE42");
  await started;
  harness.setRoom({ ...harness.room(), status: "abandoned" });
  releaseFinish();

  await expect(page.getByText("ROOM CLOSED · OCHE42", { exact: true })).toBeVisible();
  await staleComplete;
  await expect(page.getByText("ROOM CLOSED · OCHE42", { exact: true })).toBeVisible();
  await expect(page.getByText("MATCH COMPLETE", { exact: true })).toHaveCount(0);
  await expect(page.locator(".score-player.active")).toHaveCount(0);
  await expect(page.locator(".dart-input-pad")).toHaveCount(0);
  expect(harness.completes()).toBe(1);
});
