import { describe, expect, it } from "vitest";
import { darts, matches, players, turns } from "@/db/schema";
import type { MatchRecord } from "@/domain/match-record";
import { listMatches, MatchHistoryError, recordMatch, type Database } from "./match-history";

interface Statement {
  readonly kind: "insert" | "update";
  readonly table: unknown;
  readonly rows: readonly Record<string, unknown>[];
}

/**
 * A database that records what it was asked to do instead of doing it.
 *
 * The point of these tests is the shape of the write — which rows, in which order,
 * carrying which ownership — and that is decided before anything reaches Postgres.
 */
function fakeDatabase(options: { failOn?: "batch" | "execute"; rows?: readonly unknown[] } = {}) {
  const batches: Statement[][] = [];
  const database = {
    insert: (table: unknown) => ({ values: (rows: unknown) => ({ kind: "insert", table, rows: Array.isArray(rows) ? rows : [rows] }) }),
    update: (table: unknown) => ({ set: (rows: unknown) => ({ where: () => ({ kind: "update", table, rows: [rows] }) }) }),
    batch: async (statements: Statement[]) => {
      if (options.failOn === "batch") throw new Error("connection reset");
      batches.push(statements);
    },
    execute: async () => {
      if (options.failOn === "execute") throw new Error("connection reset");
      return { rows: options.rows ?? [] };
    },
  };
  return { database: database as unknown as Database, batches };
}

const RECORD: MatchRecord = {
  mode: "x01",
  options: { startingScore: 501 },
  players: [
    { seat: 0, displayName: "Player 1", isBot: false },
    { seat: 1, displayName: "The Navigator", isBot: true, botLevel: 12 },
  ],
  turns: [
    {
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 501,
      scoreAfter: 441,
      bust: false,
      dartsThrown: 3,
      darts: [
        { ordinal: 1, segment: 20, multiplier: 1, x: 0.25, y: -0.5 },
        { ordinal: 2, segment: 20, multiplier: 1 },
        { ordinal: 3, segment: 20, multiplier: 1 },
      ],
    },
  ],
  winnerSeat: 0,
};

function statementsFor(batch: Statement[], table: unknown): Statement | undefined {
  return batch.find((statement) => statement.table === table);
}

describe("recording a finished match", () => {
  it("writes the match, its roster, its visits, and its darts in one transaction", async () => {
    const { database, batches } = fakeDatabase();
    const id = await recordMatch("user-1", RECORD, 0, database);

    expect(batches).toHaveLength(1);
    const batch = batches[0]!;
    expect(batch.map((statement) => statement.table)).toEqual([matches, players, turns, darts, matches]);

    const match = statementsFor(batch, matches)!.rows[0]!;
    expect(match).toMatchObject({ id, mode: "x01", status: "complete", options: { startingScore: 501 } });
  });

  it("links only the seat the requester played to their account", async () => {
    const { database, batches } = fakeDatabase();
    await recordMatch("user-1", RECORD, 0, database);

    expect(statementsFor(batches[0]!, players)!.rows).toEqual([
      expect.objectContaining({ seat: 0, userId: "user-1", isBot: false, botLevel: null }),
      expect.objectContaining({ seat: 1, userId: null, isBot: true, botLevel: 12 }),
    ]);
  });

  it("files the match under the seat the requester actually occupied", async () => {
    const { database, batches } = fakeDatabase();
    await recordMatch("user-1", { ...RECORD, winnerSeat: 1 }, 1, database);

    const roster = statementsFor(batches[0]!, players)!.rows;
    expect(roster[0]).toMatchObject({ seat: 0, userId: null });
    expect(roster[1]).toMatchObject({ seat: 1, userId: "user-1" });
  });

  it("stores a landing point as integer microunits", async () => {
    const { database, batches } = fakeDatabase();
    await recordMatch("user-1", RECORD, 0, database);

    expect(statementsFor(batches[0]!, darts)!.rows).toEqual([
      expect.objectContaining({ ordinal: 1, segment: 20, multiplier: 1, x: 250_000, y: -500_000 }),
      expect.objectContaining({ ordinal: 2, x: null, y: null }),
      expect.objectContaining({ ordinal: 3, x: null, y: null }),
    ]);
  });

  it("keeps the score a typed visit claimed", async () => {
    const typed: MatchRecord = {
      ...RECORD,
      turns: [{ seat: 0, turnNumber: 1, legNumber: 1, scoreBefore: 501, scoreAfter: 441, bust: false, dartsThrown: 3, aggregateScore: 60, darts: [] }],
    };
    const { database, batches } = fakeDatabase();
    await recordMatch("user-1", typed, 0, database);

    expect(statementsFor(batches[0]!, turns)!.rows[0]).toMatchObject({ aggregateScore: 60, dartsThrown: 3 });
    // No darts were thrown, so no darts statement is sent at all.
    expect(batches[0]!.filter((statement) => statement.table === darts)).toHaveLength(0);
  });

  it("records an unfinished match as abandoned and names no winner", async () => {
    const { database, batches } = fakeDatabase();
    await recordMatch("user-1", { ...RECORD, winnerSeat: undefined }, 0, database);

    expect(statementsFor(batches[0]!, matches)!.rows[0]).toMatchObject({ status: "abandoned" });
    expect(batches[0]!.filter((statement) => statement.kind === "update")).toHaveLength(0);
  });

  it("reports a database failure as unavailable rather than as a server fault", async () => {
    const { database } = fakeDatabase({ failOn: "batch" });
    await expect(recordMatch("user-1", RECORD, 0, database)).rejects.toBeInstanceOf(MatchHistoryError);
  });
});

describe("reading a player's history", () => {
  const row = {
    id: "match-1",
    mode: "cricket",
    completedAt: "2026-07-30T21:00:00.000Z",
    winnerSeat: 1,
    turnCount: 12,
    dartCount: 36,
    players: [
      { seat: 0, displayName: "Player 1", isBot: false, botLevel: null, userId: "user-1" },
      { seat: 1, displayName: "Player 2", isBot: false, botLevel: null, userId: null },
    ],
  };

  it("marks which seat was the reader's own", async () => {
    const { database } = fakeDatabase({ rows: [row] });
    const [entry] = await listMatches("user-1", 20, database);

    expect(entry).toMatchObject({ id: "match-1", mode: "cricket", winnerSeat: 1, turnCount: 12, dartCount: 36 });
    expect(entry?.players.map((player) => player.isYou)).toEqual([true, false]);
    expect(entry?.completedAt).toBe("2026-07-30T21:00:00.000Z");
  });

  it("reports a database failure as unavailable", async () => {
    const { database } = fakeDatabase({ failOn: "execute" });
    await expect(listMatches("user-1", 20, database)).rejects.toBeInstanceOf(MatchHistoryError);
  });
});
