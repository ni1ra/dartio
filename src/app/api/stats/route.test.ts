import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
import type { StatMatch } from "@/domain/match-stats";
import { accessSnapshot, AccessServiceError } from "@/lib/server/access";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError } from "@/lib/server/match-history";
import { handleStatsRequest } from "./route";

const FREE = accessSnapshot(true, null);
const PRO = accessSnapshot(true, {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
});

const MATCH: StatMatch = {
  id: "match-1",
  mode: "x01",
  outRule: "double",
  won: true,
  turns: [
    { legNumber: 1, scoreBefore: 101, scoreAfter: 41, bust: false, dartsThrown: 1 },
    { legNumber: 1, scoreBefore: 41, scoreAfter: 0, bust: false, dartsThrown: 2 },
  ],
};

function deps(access = FREE, read = vi.fn(async () => [MATCH])) {
  return { resolveAccess: async () => ({ userId: "user-1", access }), read, spy: read };
}

describe("GET /api/stats", () => {
  it("gives every player their headline numbers", async () => {
    const response = await handleStatsRequest(deps());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      matchesPlayed: 1,
      matchesWon: 1,
      winPercentage: 100,
      visits: 2,
      dartsThrown: 3,
      threeDartAverage: 101,
    });
  });

  it("withholds the deep figures from Free rather than sending them to be hidden", async () => {
    const response = await handleStatsRequest(deps(FREE));
    const body = await response.json();

    expect(body.deep).toBeNull();
    // Nothing paid is anywhere in the payload, not merely absent from one field.
    expect(JSON.stringify(body)).not.toContain("checkoutPercentage");
    expect(body.historyLimit).toBe(50);
  });

  it("sends the deep figures to a paid plan", async () => {
    const response = await handleStatsRequest(deps(PRO));
    const body = await response.json();

    expect(body.historyLimit).toBeNull();
    expect(body.deep).toMatchObject({
      x01Matches: 1,
      checkoutAttempts: 2,
      checkoutsHit: 1,
      checkoutPercentage: 50,
      bestVisit: 60,
      bestLegDarts: 3,
      busts: 0,
    });
    expect(body.deep.modes).toEqual([{ mode: "x01", played: 1, won: 1 }]);
  });

  it("reads only as far back as the plan allows", async () => {
    const free = deps(FREE);
    await handleStatsRequest(free);
    expect(free.spy).toHaveBeenCalledWith("user-1", 50);

    const pro = deps(PRO);
    await handleStatsRequest(pro);
    expect(pro.spy).toHaveBeenCalledWith("user-1", null);
  });

  it("answers 401 when nobody is signed in", async () => {
    const response = await handleStatsRequest({ resolveAccess: async () => { throw new AuthError(); } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it.each([
    [new MatchHistoryError(), "match_history_unavailable"],
    [new AuthServiceError(), "access_status_unavailable"],
    [new AccessServiceError(), "access_status_unavailable"],
  ])("answers 503 rather than an empty career when the store is down", async (failure, error) => {
    const response = await handleStatsRequest({
      resolveAccess: async () => ({ userId: "user-1", access: FREE }),
      read: async () => { throw failure; },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("does not leak an unexpected server error", async () => {
    const response = await handleStatsRequest({
      resolveAccess: async () => ({ userId: "user-1", access: FREE }),
      read: async () => { throw new Error("DATABASE_URL=redacted"); },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "stats_failed" });
  });
});
