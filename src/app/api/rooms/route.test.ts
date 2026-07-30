import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
import { EntitlementRequiredError } from "@/lib/server/entitlements";
import { AuthError } from "@/lib/server/identity";
import { RoomError, RoomServiceError, type RoomState } from "@/lib/server/rooms";
import { handleCreateRoomRequest } from "./route";
import { handleJoinRoomRequest, handleReadRoomRequest } from "./[code]/route";
import { handleRoomTurnRequest } from "./[code]/turns/route";

const signedIn = async () => ({ userId: "user-1", displayName: "Lain" });

function post(body: unknown, url = "https://dartio.test/api/rooms"): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const VALID_VISIT = {
  expectedVersion: 3,
  seat: 1,
  turn: {
    legNumber: 1, scoreBefore: 501, scoreAfter: 441, bust: false, dartsThrown: 3,
    darts: [
      { ordinal: 1, segment: 20, multiplier: 1 },
      { ordinal: 2, segment: 20, multiplier: 1 },
      { ordinal: 3, segment: 20, multiplier: 1 },
    ],
  },
};

describe("POST /api/rooms", () => {
  it("opens a room for an entitled player", async () => {
    const create = vi.fn(async () => ({ code: "OCHE42", seat: 0 }));
    const response = await handleCreateRoomRequest(
      post({ mode: "x01", options: { startingScore: 501 } }),
      { authorize: signedIn, create },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ code: "OCHE42", seat: 0 });
  });

  it("refuses a mode that does not exist rather than opening a room nobody can play", async () => {
    const create = vi.fn();
    const response = await handleCreateRoomRequest(post({ mode: "quantum-darts" }), { authorize: signedIn, create });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 402 for a plan without online play, before any room exists", async () => {
    const create = vi.fn();
    const response = await handleCreateRoomRequest(post({ mode: "x01" }), {
      authorize: async () => { throw new EntitlementRequiredError("online_multiplayer"); },
      create,
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({ error: "upgrade_required", required: "online_multiplayer" });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 401 when nobody is signed in", async () => {
    const response = await handleCreateRoomRequest(post({ mode: "x01" }), {
      authorize: async () => { throw new AuthError(); },
    });
    expect(response.status).toBe(401);
  });

  it("reports an unavailable store as 503 rather than as a server fault", async () => {
    const response = await handleCreateRoomRequest(post({ mode: "x01" }), {
      authorize: signedIn,
      create: async () => { throw new RoomServiceError(); },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "rooms_unavailable" });
  });
});

describe("POST /api/rooms/{code}", () => {
  it("seats a player and returns the seat they got", async () => {
    const join = vi.fn(async () => ({ code: "OCHE42", seat: 1 }));
    const response = await handleJoinRoomRequest(post({}), "oche42", { authorize: signedIn, join });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "OCHE42", seat: 1 });
    expect(join).toHaveBeenCalledWith("user-1", "oche42", "Lain");
  });

  it.each([
    [new RoomError(404, "room_not_found", "That room isn't live"), 404, "room_not_found"],
    [new RoomError(409, "room_full", "This room has no free seat"), 409, "room_full"],
    [new RoomError(409, "room_closed", "already finished"), 409, "room_closed"],
  ])("passes a room refusal through with its own status and code", async (failure, status, code) => {
    const response = await handleJoinRoomRequest(post({}), "OCHE42", {
      authorize: signedIn,
      join: async () => { throw failure; },
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: code });
  });
});

describe("GET /api/rooms/{code}", () => {
  const state: RoomState = {
    code: "OCHE42", mode: "x01", options: {}, status: "active", version: 4, yourSeat: 1,
    seats: [{ seat: 0, displayName: "Lain", isYou: false, role: "owner" }, { seat: 1, displayName: "Player 2", isYou: true, role: "player" }],
    turns: [],
  };

  it("returns only what arrived after the version the client holds", async () => {
    const read = vi.fn(async () => state);
    const response = await handleReadRoomRequest(new Request("https://dartio.test/api/rooms/OCHE42?since=3"), "OCHE42", { authorize: signedIn, read });

    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith("user-1", "OCHE42", 3);
  });

  it.each([["", 0], ["?since=banana", 0], ["?since=-2", 0], ["?since=12", 12]])(
    "reads %s as version %i, because an unreadable cursor must mean 'send everything'",
    async (query, expected) => {
      const read = vi.fn(async () => state);
      await handleReadRoomRequest(new Request(`https://dartio.test/api/rooms/OCHE42${query}`), "OCHE42", { authorize: signedIn, read });
      expect(read).toHaveBeenCalledWith("user-1", "OCHE42", expected);
    },
  );
});

describe("POST /api/rooms/{code}/turns", () => {
  it("files a visit and answers with the version it created", async () => {
    const append = vi.fn(async () => ({ version: 4 }));
    const response = await handleRoomTurnRequest(post(VALID_VISIT, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", { authorize: signedIn, append });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ version: 4 });
  });

  it("answers 409 when somebody else already extended that version", async () => {
    const response = await handleRoomTurnRequest(post(VALID_VISIT, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", {
      authorize: signedIn,
      append: async () => { throw new RoomError(409, "version_conflict", "Somebody else threw first"); },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "version_conflict" });
  });

  it("answers 403 for a throw from somebody else's seat", async () => {
    const response = await handleRoomTurnRequest(post(VALID_VISIT, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", {
      authorize: signedIn,
      append: async () => { throw new RoomError(403, "wrong_seat", "You can only throw from your own seat"); },
    });
    expect(response.status).toBe(403);
  });

  it.each([
    ["a turn number the client tried to choose", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, turnNumber: 99 } }],
    ["a dart that never landed on a board", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, darts: [{ ordinal: 1, segment: 21, multiplier: 1 }] } }],
    ["a treble bull", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, darts: [{ ordinal: 1, segment: 25, multiplier: 3 }] } }],
    ["darts that disagree with the count", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, dartsThrown: 2 } }],
  ])("refuses %s", async (_label, body) => {
    const append = vi.fn();
    const response = await handleRoomTurnRequest(post(body, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", { authorize: signedIn, append });

    expect(response.status).toBe(400);
    expect(append).not.toHaveBeenCalled();
  });
});
