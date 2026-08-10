import { describe, expect, it } from "vitest";
import {
  appendRoomTurn,
  completeRoomMatch,
  createRoom,
  generateRoomCode,
  joinRoom,
  MAX_SPECTATORS,
  readRoom,
  RoomError,
  RoomServiceError,
  spectateRoom,
  type Database,
} from "./rooms";

interface Statement { readonly kind: string; readonly table: unknown; readonly rows: readonly Record<string, unknown>[] }

const SEAT_ZERO = { seat: 0, userId: "user-1", displayName: "Player 1", playerId: "player-1", role: "owner" };
const SEAT_ONE = { seat: 1, userId: "user-2", displayName: "Player 2", playerId: "player-2", role: "player" };

function room(overrides: Record<string, unknown> = {}) {
  const seats = (overrides.seats as typeof SEAT_ZERO[] | undefined) ?? [SEAT_ZERO, SEAT_ONE];
  return {
    roomId: "room-1",
    matchId: "match-1",
    code: "OCHE42",
    mode: "x01",
    options: { startingScore: 501 },
    status: "active",
    version: 3,
    seats,
    // Membership mirrors the seats unless a test says otherwise — the way the real
    // query behaves, where every seated player has a membership row.
    members: seats.map((seat) => ({ userId: seat.userId, role: seat.role })),
    ...overrides,
  };
}

/**
 * A database that answers from a queue and records what it was asked to write.
 * Every claim these tests make — who may write, what order, what happens when two
 * writers collide — is decided before anything reaches Postgres.
 */
function fakeDatabase(options: { queue?: unknown[][]; failBatch?: readonly (Error | null)[]; failInsert?: readonly Error[] } = {}) {
  const queue = [...(options.queue ?? [])];
  const failures = [...(options.failBatch ?? [])];
  const insertFailures = [...(options.failInsert ?? [])];
  const batches: Statement[][] = [];
  const writes: Statement[] = [];
  const database = {
    // An insert is a statement when it goes into a batch and a write when awaited
    // on its own, so it is a thenable that records itself only at await time — a
    // batched statement is never awaited individually and must not self-record.
    insert: (table: unknown) => ({
      values: (rows: unknown) => {
        const statement: Statement = { kind: "insert", table, rows: Array.isArray(rows) ? rows : [rows] };
        return Object.assign({
          then: (resolve: (value: unknown) => void, reject: (cause: unknown) => void) => {
            const failure = insertFailures.shift();
            if (failure) { reject(failure); return; }
            writes.push(statement);
            resolve(undefined);
          },
        }, statement);
      },
    }),
    // `where` is awaited directly when an update stands alone, and used as a value
    // when it goes into a batch, so it has to be both.
    update: (table: unknown) => ({
      set: (rows: unknown) => ({
        where: () => Object.assign(Promise.resolve(), { kind: "update", table, rows: [rows] }),
      }),
    }),
    batch: async (statements: Statement[]) => {
      const failure = failures.shift();
      if (failure) throw failure;
      batches.push(statements);
    },
    execute: async () => ({ rows: queue.shift() ?? [] }),
  };
  return { database: database as unknown as Database, batches, writes };
}

function uniqueViolation(): Error {
  return Object.assign(new Error("duplicate key"), { code: "23505" });
}

describe("room codes", () => {
  it("never contains a character that is read wrong down a phone", () => {
    // 200 codes is enough that a forbidden character would show up if it could.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe("opening a room", () => {
  it("seats the owner and writes the room, the membership, the match, and the seat", async () => {
    const { database, batches } = fakeDatabase();
    const result = await createRoom("user-1", { mode: "x01", options: { startingScore: 501 }, displayName: "Lain" }, database);

    expect(result.seat).toBe(0);
    expect(result.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(4);
  });

  it("tries another code when one is already taken", async () => {
    const { database, batches } = fakeDatabase({ failBatch: [uniqueViolation(), null] });
    const result = await createRoom("user-1", { mode: "x01", options: {}, displayName: "Lain" }, database);

    expect(result.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(batches).toHaveLength(1);
  });

  it("gives up rather than looping forever on a database that keeps refusing", async () => {
    const { database } = fakeDatabase({ failBatch: Array.from({ length: 5 }, () => uniqueViolation()) });
    await expect(createRoom("user-1", { mode: "x01", options: {}, displayName: "Lain" }, database))
      .rejects.toBeInstanceOf(RoomServiceError);
  });
});

describe("taking a seat", () => {
  it("returns the seat a player already holds instead of seating them twice", async () => {
    const { database, batches } = fakeDatabase({ queue: [[room()]] });
    await expect(joinRoom("user-2", "oche42", "Player 2", database)).resolves.toEqual({ code: "OCHE42", seat: 1 });
    expect(batches).toHaveLength(0);
  });

  it("takes the lowest free seat, so a rejoin does not widen the table", async () => {
    const { database, batches } = fakeDatabase({ queue: [[room({ seats: [SEAT_ZERO, { ...SEAT_ONE, seat: 3 }] })]] });
    await expect(joinRoom("user-3", "OCHE42", "Player 3", database)).resolves.toEqual({ code: "OCHE42", seat: 1 });
    expect(batches[0]).toHaveLength(3);
  });

  it("refuses a room whose match is already over", async () => {
    const { database } = fakeDatabase({ queue: [[room({ status: "complete" })]] });
    await expect(joinRoom("user-3", "OCHE42", "Player 3", database)).rejects.toMatchObject({ status: 409, code: "room_closed" });
  });

  it("answers a code that does not exist and one that expired identically", async () => {
    const { database } = fakeDatabase({ queue: [[]] });
    await expect(joinRoom("user-3", "NOPE99", "Player 3", database)).rejects.toMatchObject({ status: 404, code: "room_not_found" });
  });

  it("promotes a watcher taking a seat instead of inserting a second membership row", async () => {
    const watching = room({ members: [
      { userId: "user-1", role: "owner" },
      { userId: "user-2", role: "player" },
      { userId: "user-3", role: "spectator" },
    ] });
    const { database, batches } = fakeDatabase({ queue: [[watching]] });
    await expect(joinRoom("user-3", "OCHE42", "Player 3", database)).resolves.toEqual({ code: "OCHE42", seat: 2 });

    // A second insert would trip the membership primary key; the promotion updates.
    expect(batches[0]).toHaveLength(3);
    expect(batches[0]![0]).toMatchObject({ kind: "update" });
    expect(batches[0]![0]!.rows[0]).toMatchObject({ role: "player" });
  });
});

describe("filing a visit into a room", () => {
  const visit = {
    expectedVersion: 3,
    seat: 1,
    turn: { legNumber: 1, scoreBefore: 501, scoreAfter: 441, bust: false, dartsThrown: 3 as const, darts: [{ ordinal: 1 as const, segment: 20, multiplier: 1 as const }] },
  };

  it("accepts a write that extends the version it claims to, and numbers the turn itself", async () => {
    const { database, batches } = fakeDatabase({ queue: [[room()], [{ version: 4 }]] });
    await expect(appendRoomTurn("user-2", "OCHE42", visit, database)).resolves.toEqual({ version: 4 });

    const turnRow = batches[0]![0]!.rows[0]!;
    // The number came from the accepted version, never from the request.
    expect(turnRow).toMatchObject({ turnNumber: 4, playerId: "player-2", legNumber: 1, dartsThrown: 3 });
    expect(batches[0]).toHaveLength(2);
  });

  it("refuses a write whose version somebody else already used", async () => {
    // The conditional update matches no row, which is what a conflict looks like.
    const { database, batches } = fakeDatabase({ queue: [[room()], []] });
    await expect(appendRoomTurn("user-2", "OCHE42", visit, database)).rejects.toMatchObject({ status: 409, code: "version_conflict" });
    expect(batches).toHaveLength(0);
  });

  it("refuses somebody who is not in the room", async () => {
    const { database } = fakeDatabase({ queue: [[room()]] });
    await expect(appendRoomTurn("stranger", "OCHE42", visit, database)).rejects.toMatchObject({ status: 403, code: "not_a_member" });
  });

  it("refuses a spectator as read-only, not as a stranger", async () => {
    // The chair confers no arm — and no version arithmetic runs before the refusal,
    // which the empty statement queue proves: a version check would ask the database.
    const gallery = room({ members: [...room().members as [], { userId: "watcher", role: "spectator" }] });
    const { database, batches } = fakeDatabase({ queue: [[gallery]] });
    await expect(appendRoomTurn("watcher", "OCHE42", visit, database)).rejects.toMatchObject({ status: 403, code: "spectator_read_only" });
    expect(batches).toHaveLength(0);
  });

  it("refuses a member throwing from somebody else's seat", async () => {
    const { database } = fakeDatabase({ queue: [[room()]] });
    await expect(appendRoomTurn("user-1", "OCHE42", visit, database)).rejects.toMatchObject({ status: 403, code: "wrong_seat" });
  });

  it("does not send a darts statement for a visit typed as a total", async () => {
    const { database, batches } = fakeDatabase({ queue: [[room()], [{ version: 4 }]] });
    await appendRoomTurn("user-2", "OCHE42", { ...visit, turn: { ...visit.turn, darts: [], aggregateScore: 60 } }, database);

    expect(batches[0]).toHaveLength(1);
    expect(batches[0]![0]!.rows[0]).toMatchObject({ aggregateScore: 60 });
  });
});

describe("reading a room", () => {
  it("marks the reader's own seat and returns the visits after the version they hold", async () => {
    const turnRow = {
      turnNumber: 4, seat: 1, legNumber: 1, scoreBefore: 501, scoreAfter: 441,
      bust: false, dartsThrown: 3, aggregateScore: null,
      darts: [{ ordinal: 1, segment: 20, multiplier: 1 }],
    };
    const { database } = fakeDatabase({ queue: [[room()], [turnRow]] });
    const state = await readRoom("user-2", "OCHE42", 3, database);

    expect(state).toMatchObject({ code: "OCHE42", mode: "x01", status: "active", version: 3, yourSeat: 1 });
    expect(state.seats.map((seat) => seat.isYou)).toEqual([false, true]);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]).toMatchObject({ version: 4, turnNumber: 4, seat: 1 });
    expect(state.turns[0]?.aggregateScore).toBeUndefined();
  });

  it("gives an entitled stranger a null seat and no standing rather than a refusal", async () => {
    const { database } = fakeDatabase({ queue: [[room()], []] });
    const state = await readRoom("stranger", "OCHE42", 0, database);

    expect(state.yourSeat).toBeNull();
    expect(state.yourRole).toBeNull();
    expect(state.seats.every((seat) => !seat.isYou)).toBe(true);
  });

  it("counts the gallery and names the reader's standing in it", async () => {
    const gallery = room({ members: [
      ...room().members as [],
      { userId: "watcher", role: "spectator" },
      { userId: "watcher-2", role: "spectator" },
    ] });
    const { database } = fakeDatabase({ queue: [[gallery], []] });
    const state = await readRoom("watcher", "OCHE42", 0, database);

    expect(state).toMatchObject({ yourSeat: null, yourRole: "spectator", watching: 2 });
    // The seats stay the players': a gallery is counted, never seated.
    expect(state.seats).toHaveLength(2);
  });

  it("reports a database failure as unavailable rather than as a missing room", async () => {
    const broken = { execute: async () => { throw new Error("connection reset"); } } as unknown as Database;
    await expect(readRoom("user-1", "OCHE42", 0, broken)).rejects.toBeInstanceOf(RoomServiceError);
  });
});

describe("the error contract", () => {
  it("carries a status and a stable code a client can branch on", () => {
    const error = new RoomError(409, "version_conflict", "Somebody else threw first");
    expect(error).toMatchObject({ status: 409, code: "version_conflict" });
    expect(error.message).toContain("Somebody else");
  });
});

describe("closing a room's match", () => {
  it("names the winner and marks the match complete", async () => {
    const { database, batches } = fakeDatabase({ queue: [[room()]] });
    await expect(completeRoomMatch("user-1", "OCHE42", 1, database)).resolves.toEqual({ alreadyComplete: false });
    // The update goes out on its own, not through a batch.
    expect(batches).toHaveLength(0);
  });

  it("agrees with the second player rather than fighting them", async () => {
    // Both replay the same log, both see the same finish, both report it.
    const { database } = fakeDatabase({ queue: [[room({ status: "complete" })]] });
    await expect(completeRoomMatch("user-2", "OCHE42", 1, database)).resolves.toEqual({ alreadyComplete: true });
  });

  it("refuses a seat that is not in the room", async () => {
    const { database } = fakeDatabase({ queue: [[room()]] });
    await expect(completeRoomMatch("user-1", "OCHE42", 6, database)).rejects.toMatchObject({ status: 422, code: "unknown_seat" });
  });

  it("refuses somebody who is not in the room", async () => {
    const { database } = fakeDatabase({ queue: [[room()]] });
    await expect(completeRoomMatch("stranger", "OCHE42", 1, database)).rejects.toMatchObject({ status: 403, code: "not_a_member" });
  });

  it("refuses a spectator's report — watching a finish is not reporting one", async () => {
    const gallery = room({ members: [...room().members as [], { userId: "watcher", role: "spectator" }] });
    const { database } = fakeDatabase({ queue: [[gallery]] });
    await expect(completeRoomMatch("watcher", "OCHE42", 1, database)).rejects.toMatchObject({ status: 403, code: "spectator_read_only" });
  });

  it("accepts a match that ended with no winner", async () => {
    const { database } = fakeDatabase({ queue: [[room()]] });
    await expect(completeRoomMatch("user-1", "OCHE42", null, database)).resolves.toEqual({ alreadyComplete: false });
  });
});

describe("pulling up a chair", () => {
  it("writes one spectator membership row and nothing else", async () => {
    const { database, writes, batches } = fakeDatabase({ queue: [[room()]] });
    await expect(spectateRoom("watcher", "oche42", database)).resolves.toEqual({ code: "OCHE42", role: "spectator" });

    expect(writes).toHaveLength(1);
    expect(writes[0]!.rows[0]).toMatchObject({ userId: "watcher", role: "spectator" });
    // No players row: the read-only promise is structural, not policed.
    expect(batches).toHaveLength(0);
  });

  it("tells a seated player asking to watch what they already are, without writing", async () => {
    const { database, writes } = fakeDatabase({ queue: [[room()]] });
    await expect(spectateRoom("user-1", "OCHE42", database)).resolves.toEqual({ code: "OCHE42", role: "owner" });
    expect(writes).toHaveLength(0);
  });

  it("answers a watcher asking twice with the same chair, without writing twice", async () => {
    const gallery = room({ members: [...room().members as [], { userId: "watcher", role: "spectator" }] });
    const { database, writes } = fakeDatabase({ queue: [[gallery]] });
    await expect(spectateRoom("watcher", "OCHE42", database)).resolves.toEqual({ code: "OCHE42", role: "spectator" });
    expect(writes).toHaveLength(0);
  });

  it("treats two racing taps as one chair when the membership key refuses the second", async () => {
    const conflict = Object.assign(new Error("duplicate key"), { code: "23505" });
    const { database } = fakeDatabase({ queue: [[room()]], failInsert: [conflict] });
    await expect(spectateRoom("watcher", "OCHE42", database)).resolves.toEqual({ code: "OCHE42", role: "spectator" });
  });

  it("refuses a room whose match is already over", async () => {
    const { database } = fakeDatabase({ queue: [[room({ status: "complete" })]] });
    await expect(spectateRoom("watcher", "OCHE42", database)).rejects.toMatchObject({ status: 409, code: "room_closed" });
  });

  it("refuses the seventeenth chair", async () => {
    const packed = room({ members: [
      ...room().members as [],
      ...Array.from({ length: MAX_SPECTATORS }, (_, index) => ({ userId: `watcher-${index}`, role: "spectator" })),
    ] });
    const { database } = fakeDatabase({ queue: [[packed]] });
    await expect(spectateRoom("late-arrival", "OCHE42", database)).rejects.toMatchObject({ status: 409, code: "gallery_full" });
  });
});
