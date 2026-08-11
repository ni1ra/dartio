import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
import { EntitlementRequiredError } from "@/lib/server/entitlements";
import { AuthError } from "@/lib/server/identity";
import { RoomError, RoomServiceError, type RoomState } from "@/lib/server/rooms";
import { handleCreateRoomRequest } from "./route";
import { handleJoinRoomRequest, handleReadRoomRequest } from "./[code]/route";
import { handleRoomTurnRequest } from "./[code]/turns/route";
import { handleCompleteRoomRequest } from "./[code]/complete/route";
import { handleHandOverRoomRequest } from "./[code]/handover/route";
import { handleCloseRoomRequest } from "./[code]/close/route";

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

  it("refuses an unauthenticated caller for that reason, whatever their body carried", async () => {
    // Caught by verify:rooms against production: the body was parsed first, so a
    // request with no session and a malformed payload learned which field was wrong
    // instead of simply being turned away.
    const response = await handleCreateRoomRequest(post({ nonsense: true }), {
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

  it("seats a player when the request carries no body at all, the way old clients did", async () => {
    const join = vi.fn(async () => ({ code: "OCHE42", seat: 1 }));
    const response = await handleJoinRoomRequest(
      new Request("https://dartio.test/api/rooms/OCHE42", { method: "POST" }),
      "OCHE42",
      { authorize: signedIn, join },
    );
    expect(response.status).toBe(200);
    expect(join).toHaveBeenCalled();
  });

  it("admits a watcher when the body asks to spectate, and never consults join", async () => {
    const join = vi.fn();
    const spectate = vi.fn(async () => ({ code: "OCHE42", role: "spectator" as const }));
    const response = await handleJoinRoomRequest(post({ spectate: true }), "oche42", { authorize: signedIn, join, spectate });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "OCHE42", role: "spectator" });
    expect(spectate).toHaveBeenCalledWith("user-1", "oche42");
    expect(join).not.toHaveBeenCalled();
  });

  it("tells a seated player asking to watch what they already are", async () => {
    const spectate = vi.fn(async () => ({ code: "OCHE42", role: "owner" as const }));
    const response = await handleJoinRoomRequest(post({ spectate: true }), "OCHE42", { authorize: signedIn, spectate });
    await expect(response.json()).resolves.toEqual({ code: "OCHE42", role: "owner" });
  });

  it("refuses a body that is neither a join nor a spectate request", async () => {
    const join = vi.fn();
    const spectate = vi.fn();
    const response = await handleJoinRoomRequest(post({ spectate: "yes" }), "OCHE42", { authorize: signedIn, join, spectate });

    expect(response.status).toBe(400);
    expect(join).not.toHaveBeenCalled();
    expect(spectate).not.toHaveBeenCalled();
  });

  it("turns away an unauthenticated watcher before reading what they asked for", async () => {
    const spectate = vi.fn();
    const response = await handleJoinRoomRequest(post({ spectate: true }), "OCHE42", {
      authorize: async () => { throw new AuthError(); },
      spectate,
    });
    expect(response.status).toBe(401);
    expect(spectate).not.toHaveBeenCalled();
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

  it("passes a full gallery through as its own refusal, not a full room", async () => {
    const response = await handleJoinRoomRequest(post({ spectate: true }), "OCHE42", {
      authorize: signedIn,
      spectate: async () => { throw new RoomError(409, "gallery_full", "This room's gallery is full"); },
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "gallery_full" });
  });
});

describe("GET /api/rooms/{code}", () => {
  const state: RoomState = {
    code: "OCHE42", mode: "x01", options: {}, status: "active", version: 4, yourSeat: 1,
    yourRole: "player", watching: 1,
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

  it("refuses a spectator's throw as read-only, not as a stranger's", async () => {
    // The distinction is the honesty: a watcher IS in the room. What they lack is a seat.
    const response = await handleRoomTurnRequest(post(VALID_VISIT, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", {
      authorize: signedIn,
      append: async () => { throw new RoomError(403, "spectator_read_only", "Spectators watch — take a seat to throw"); },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "spectator_read_only" });
  });

  it("turns away an unauthenticated write before reading what it was carrying", async () => {
    const append = vi.fn();
    const response = await handleRoomTurnRequest(post({ garbage: true }, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", {
      authorize: async () => { throw new AuthError(); },
      append,
    });

    expect(response.status).toBe(401);
    expect(append).not.toHaveBeenCalled();
  });

  it.each([
    ["a turn number the client tried to choose", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, turnNumber: 99 } }],
    ["a dart that never landed on a board", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, darts: [{ ordinal: 1, segment: 21, multiplier: 1 }] } }],
    ["a treble bull", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, darts: [{ ordinal: 1, segment: 25, multiplier: 3 }] } }],
    ["darts that disagree with the count", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, dartsThrown: 2 } }],
    ["a gapped exact-dart chronology", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, dartsThrown: 2, darts: [
      { ordinal: 2, segment: 20, multiplier: 1 },
      { ordinal: 3, segment: 20, multiplier: 1 },
    ] } }],
    ["a duplicate exact-dart chronology", { ...VALID_VISIT, turn: { ...VALID_VISIT.turn, dartsThrown: 2, darts: [
      { ordinal: 1, segment: 20, multiplier: 1 },
      { ordinal: 1, segment: 20, multiplier: 1 },
    ] } }],
  ])("refuses %s", async (_label, body) => {
    const append = vi.fn();
    const response = await handleRoomTurnRequest(post(body, "https://dartio.test/api/rooms/OCHE42/turns"), "OCHE42", { authorize: signedIn, append });

    expect(response.status).toBe(400);
    expect(append).not.toHaveBeenCalled();
  });
});

describe("POST /api/rooms/{code}/complete", () => {
  it("closes the match and says it was the first report", async () => {
    const complete = vi.fn(async () => ({ alreadyComplete: false }));
    const response = await handleCompleteRoomRequest(post({ winnerSeat: 0 }, "https://dartio.test/api/rooms/OCHE42/complete"), "OCHE42", { authorize: signedIn, complete });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alreadyComplete: false });
    expect(complete).toHaveBeenCalledWith("user-1", "OCHE42", 0);
  });

  it("treats the second report of the same finish as agreement", async () => {
    const complete = vi.fn(async () => ({ alreadyComplete: true }));
    const response = await handleCompleteRoomRequest(post({ winnerSeat: 0 }, "https://dartio.test/api/rooms/OCHE42/complete"), "OCHE42", { authorize: signedIn, complete });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alreadyComplete: true });
  });

  it("turns away an unauthenticated report before reading it", async () => {
    const complete = vi.fn();
    const response = await handleCompleteRoomRequest(post({ winnerSeat: 0 }, "https://dartio.test/api/rooms/OCHE42/complete"), "OCHE42", {
      authorize: async () => { throw new AuthError(); },
      complete,
    });
    expect(response.status).toBe(401);
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses a spectator's report — watching a finish is not reporting one", async () => {
    const response = await handleCompleteRoomRequest(post({ winnerSeat: 0 }, "https://dartio.test/api/rooms/OCHE42/complete"), "OCHE42", {
      authorize: signedIn,
      complete: async () => { throw new RoomError(403, "spectator_read_only", "Spectators watch — take a seat to throw"); },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "spectator_read_only" });
  });

  it.each([
    ["a seat off the board", { winnerSeat: 99 }],
    ["a missing winner field", {}],
    ["a stowaway field", { winnerSeat: 0, confetti: true }],
  ])("refuses %s", async (_label, body) => {
    const complete = vi.fn();
    const response = await handleCompleteRoomRequest(post(body, "https://dartio.test/api/rooms/OCHE42/complete"), "OCHE42", { authorize: signedIn, complete });
    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("POST /api/rooms/{code}/handover", () => {
  it("hands the room over and answers with the new host's seat", async () => {
    const handOver = vi.fn(async () => ({ code: "OCHE42", hostSeat: 1 }));
    const response = await handleHandOverRoomRequest(post({ toSeat: 1 }, "https://dartio.test/api/rooms/OCHE42/handover"), "OCHE42", { authorize: signedIn, handOver });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "OCHE42", hostSeat: 1 });
    expect(handOver).toHaveBeenCalledWith("user-1", "OCHE42", 1);
  });

  it("passes the host-only refusal through", async () => {
    const response = await handleHandOverRoomRequest(post({ toSeat: 0 }, "https://dartio.test/api/rooms/OCHE42/handover"), "OCHE42", {
      authorize: signedIn,
      handOver: async () => { throw new RoomError(403, "not_the_host", "Only the host hands the room over"); },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "not_the_host" });
  });

  it("turns away an unauthenticated caller before reading the body", async () => {
    const handOver = vi.fn();
    const response = await handleHandOverRoomRequest(post({ garbage: true }, "https://dartio.test/api/rooms/OCHE42/handover"), "OCHE42", {
      authorize: async () => { throw new AuthError(); },
      handOver,
    });
    expect(response.status).toBe(401);
    expect(handOver).not.toHaveBeenCalled();
  });

  it.each([
    ["a seat off the board", { toSeat: 99 }],
    ["a missing seat", {}],
    ["a stowaway field", { toSeat: 1, alsoTheKeys: true }],
  ])("refuses %s", async (_label, body) => {
    const handOver = vi.fn();
    const response = await handleHandOverRoomRequest(post(body, "https://dartio.test/api/rooms/OCHE42/handover"), "OCHE42", { authorize: signedIn, handOver });
    expect(response.status).toBe(400);
    expect(handOver).not.toHaveBeenCalled();
  });
});

describe("POST /api/rooms/{code}/close", () => {
  it("closes the room and says whether it was already closed", async () => {
    const close = vi.fn(async () => ({ alreadyClosed: false }));
    const response = await handleCloseRoomRequest(post({}, "https://dartio.test/api/rooms/OCHE42/close"), "OCHE42", { authorize: signedIn, close });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ alreadyClosed: false });
    expect(close).toHaveBeenCalledWith("user-1", "OCHE42");
  });

  it("passes the host-only refusal through", async () => {
    const response = await handleCloseRoomRequest(post({}, "https://dartio.test/api/rooms/OCHE42/close"), "OCHE42", {
      authorize: signedIn,
      close: async () => { throw new RoomError(403, "not_the_host", "Only the host closes the room"); },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "not_the_host" });
  });

  it("turns away an unauthenticated caller", async () => {
    const close = vi.fn();
    const response = await handleCloseRoomRequest(post({}, "https://dartio.test/api/rooms/OCHE42/close"), "OCHE42", {
      authorize: async () => { throw new AuthError(); },
      close,
    });
    expect(response.status).toBe(401);
    expect(close).not.toHaveBeenCalled();
  });
});
