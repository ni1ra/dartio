import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
import type { MatchReplayDetail } from "@/domain/match-replay";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError } from "@/lib/server/match-history";
import { handleMatchReplayRequest } from "./route";

const MATCH: MatchReplayDetail = {
  id: "match-1",
  completedAt: "2026-08-12T10:00:00.000Z",
  ownerSeat: 0,
  record: {
    mode: "x01",
    options: { startingScore: 40 },
    players: [{ seat: 0, displayName: "Player 1", isBot: false }],
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
  },
};

const signedIn = async () => "user-1";

describe("GET /api/matches/:id", () => {
  it("returns exactly the owner's generic match record", async () => {
    const read = vi.fn(async () => MATCH);
    const response = await handleMatchReplayRequest("match-1", { resolveUserId: signedIn, read });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ match: MATCH });
    expect(read).toHaveBeenCalledWith("user-1", "match-1");
  });

  it("uses the same private 404 for every record the ownership query cannot see", async () => {
    const response = await handleMatchReplayRequest("match-404", {
      resolveUserId: signedIn,
      read: async () => null,
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "match_not_found" });
  });

  it("refuses an anonymous reader before touching history", async () => {
    const read = vi.fn(async () => MATCH);
    const response = await handleMatchReplayRequest("match-1", {
      resolveUserId: async () => { throw new AuthError(); },
      read,
    });

    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([new AuthServiceError(), new MatchHistoryError()])("answers 503 when an authority is unavailable", async (failure) => {
    const response = await handleMatchReplayRequest("match-1", {
      resolveUserId: signedIn,
      read: async () => { throw failure; },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not leak unexpected server details", async () => {
    const response = await handleMatchReplayRequest("match-1", {
      resolveUserId: signedIn,
      read: async () => { throw new Error("DATABASE_URL=redacted"); },
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "match_replay_failed" });
  });
});
