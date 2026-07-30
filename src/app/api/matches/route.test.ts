import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
import type { MatchRecord } from "@/domain/match-record";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError, type MatchHistoryEntry } from "@/lib/server/match-history";
import { handleMatchHistoryRequest, handleRecordMatchRequest } from "./route";

const RECORD: MatchRecord = {
  mode: "x01",
  options: { startingScore: 40 },
  players: [
    { seat: 0, displayName: "Player 1", isBot: false },
    { seat: 1, displayName: "The Navigator", isBot: true, botLevel: 12 },
  ],
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
};

function post(body: unknown): Request {
  return new Request("https://dartio.test/api/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const signedIn = async () => "user-1";

describe("POST /api/matches", () => {
  it("records a match and answers with its id", async () => {
    const record = vi.fn(async () => "match-1");
    const response = await handleRecordMatchRequest(post({ record: RECORD }), { resolveUserId: signedIn, record });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ id: "match-1" });
    // The seat defaults to the one the player occupies in a local match.
    expect(record).toHaveBeenCalledWith("user-1", RECORD, 0);
  });

  it("takes the owner from the session, never from the body", async () => {
    const record = vi.fn(async () => "match-1");
    await handleRecordMatchRequest(post({ record: RECORD, userId: "someone-else" }), { resolveUserId: signedIn, record });

    // An unknown field is refused outright rather than ignored, so the write never runs.
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ["a dart that never landed on a board", { ...RECORD, turns: [{ ...RECORD.turns[0]!, darts: [{ ordinal: 1, segment: 21, multiplier: 1 }] }] }],
    ["a match with no visits", { ...RECORD, turns: [] }],
    ["a winner who was not playing", { ...RECORD, winnerSeat: 6 }],
  ])("refuses %s", async (_label, invalid) => {
    const record = vi.fn(async () => "match-1");
    const response = await handleRecordMatchRequest(post({ record: invalid }), { resolveUserId: signedIn, record });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_match_record" });
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses a claim on the AI's seat", async () => {
    const response = await handleRecordMatchRequest(post({ record: RECORD, ownerSeat: 1 }), { resolveUserId: signedIn, record: vi.fn() });
    expect(response.status).toBe(400);
  });

  it("refuses a claim on a seat nobody played", async () => {
    const response = await handleRecordMatchRequest(post({ record: RECORD, ownerSeat: 5 }), { resolveUserId: signedIn, record: vi.fn() });
    expect(response.status).toBe(400);
  });

  it("answers 401 for a player with no account, because free play has no history", async () => {
    const response = await handleRecordMatchRequest(post({ record: RECORD }), {
      resolveUserId: async () => { throw new AuthError(); },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it.each([new AuthServiceError(), new MatchHistoryError()])("answers 503 when the authority or the store is down", async (failure) => {
    const response = await handleRecordMatchRequest(post({ record: RECORD }), {
      resolveUserId: signedIn,
      record: async () => { throw failure; },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "match_history_unavailable" });
  });

  it("does not leak an unexpected server error", async () => {
    const response = await handleRecordMatchRequest(post({ record: RECORD }), {
      resolveUserId: signedIn,
      record: async () => { throw new Error("DATABASE_URL=redacted"); },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "match_not_recorded" });
  });
});

describe("GET /api/matches", () => {
  const entry: MatchHistoryEntry = {
    id: "match-1",
    mode: "x01",
    completedAt: "2026-07-30T21:00:00.000Z",
    players: [{ seat: 0, displayName: "Player 1", isBot: false, botLevel: null, isYou: true }],
    winnerSeat: 0,
    turnCount: 1,
    dartCount: 1,
  };

  it("returns the player's own matches", async () => {
    const response = await handleMatchHistoryRequest(new Request("https://dartio.test/api/matches"), {
      resolveUserId: signedIn,
      list: async () => [entry],
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ matches: [entry] });
  });

  it.each([
    ["no limit", "", 20],
    ["a nonsense limit", "?limit=banana", 20],
    ["a negative limit", "?limit=-4", 20],
    ["an honest limit", "?limit=5", 5],
    ["a limit larger than the page cap", "?limit=5000", 100],
  ])("reads %s as %i matches", async (_label, query, expected) => {
    const list = vi.fn(async () => []);
    await handleMatchHistoryRequest(new Request(`https://dartio.test/api/matches${query}`), { resolveUserId: signedIn, list });

    expect(list).toHaveBeenCalledWith("user-1", expected);
  });

  it("answers 401 rather than an empty past when nobody is signed in", async () => {
    const response = await handleMatchHistoryRequest(new Request("https://dartio.test/api/matches"), {
      resolveUserId: async () => { throw new AuthError(); },
    });

    expect(response.status).toBe(401);
  });
});
