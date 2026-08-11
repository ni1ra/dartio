import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { darts, matches, players, turns } from "@/db/schema";
import type { MatchRecord } from "@/domain/match-record";
import { buildMatchReplayTimeline } from "@/domain/match-replay";
import { listMatches, MatchHistoryError, readMatchReplay, readStatMatches, recordMatch, type Database } from "./match-history";

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
  const queries: SQL[] = [];
  const database = {
    insert: (table: unknown) => ({ values: (rows: unknown) => ({ kind: "insert", table, rows: Array.isArray(rows) ? rows : [rows] }) }),
    update: (table: unknown) => ({ set: (rows: unknown) => ({ where: () => ({ kind: "update", table, rows: [rows] }) }) }),
    batch: async (statements: Statement[]) => {
      if (options.failOn === "batch") throw new Error("connection reset");
      batches.push(statements);
    },
    execute: async (query: SQL) => {
      if (options.failOn === "execute") throw new Error("connection reset");
      queries.push(query);
      return { rows: options.rows ?? [] };
    },
  };
  return { database: database as unknown as Database, batches, queries };
}

function rendered(query: SQL): string {
  return new PgDialect().sqlToQuery(query).sql;
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
    const { database, queries } = fakeDatabase({ rows: [row] });
    const [entry] = await listMatches("user-1", 20, database);

    expect(entry).toMatchObject({ id: "match-1", mode: "cricket", winnerSeat: 1, turnCount: 12, dartCount: 36 });
    expect(entry?.players.map((player) => player.isYou)).toEqual([true, false]);
    expect(entry?.completedAt).toBe("2026-07-30T21:00:00.000Z");
    expect(rendered(queries[0]!)).toContain('"matches"."completed_at" is not null');
  });

  it("keeps unfinished room rows out of statistics too", async () => {
    const { database, queries } = fakeDatabase();
    await expect(readStatMatches("user-1", null, database)).resolves.toEqual([]);
    expect(rendered(queries[0]!)).toContain('"matches"."completed_at" is not null');
  });

  it("reports a database failure as unavailable", async () => {
    const { database } = fakeDatabase({ failOn: "execute" });
    await expect(listMatches("user-1", 20, database)).rejects.toBeInstanceOf(MatchHistoryError);
  });
});

describe("reading one match for replay", () => {
  const replayRow = {
    id: "match-1",
    mode: "future-mode",
    options: { rounds: 4 },
    completedAt: "2026-08-12T10:00:00.000Z",
    winnerSeat: 0,
    ownerSeat: 0,
    players: [
      { seat: 0, displayName: "Player 1", isBot: false, botLevel: null },
      { seat: 1, displayName: "Bot", isBot: true, botLevel: 12 },
    ],
    turns: [{
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
      aggregateScore: null,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2, x: 250_000, y: -500_000 }],
    }],
  };

  it("rebuilds the generic record and converts stored microunits", async () => {
    const { database, queries } = fakeDatabase({ rows: [replayRow] });

    await expect(readMatchReplay("user-1", "match-1", database)).resolves.toEqual({
      id: "match-1",
      completedAt: "2026-08-12T10:00:00.000Z",
      ownerSeat: 0,
      record: {
        mode: "future-mode",
        options: { rounds: 4 },
        players: [
          { seat: 0, displayName: "Player 1", isBot: false },
          { seat: 1, displayName: "Bot", isBot: true, botLevel: 12 },
        ],
        turns: [{
          seat: 0,
          turnNumber: 1,
          legNumber: 1,
          scoreBefore: 40,
          scoreAfter: 0,
          bust: false,
          dartsThrown: 1,
          darts: [{ ordinal: 1, segment: 20, multiplier: 2, x: 0.25, y: -0.5 }],
        }],
        winnerSeat: 0,
      },
    });

    const query = rendered(queries[0]!);
    expect(query).toContain('"matches"."completed_at" is not null');
    expect(query).toContain("reader.user_id = $1");
    expect(query).toContain("order by visit.turn_number");
    expect(query).toContain("order by thrown.ordinal");
  });

  it("returns no clue for a missing or unowned match", async () => {
    const { database } = fakeDatabase();
    await expect(readMatchReplay("user-1", "match-404", database)).resolves.toBeNull();
  });

  it("preserves an aggregate visit as marker-free unknown dart frames", async () => {
    const aggregateRow = {
      ...replayRow,
      winnerSeat: null,
      turns: [{
        ...replayRow.turns[0]!,
        scoreBefore: 501,
        scoreAfter: 441,
        dartsThrown: 3,
        aggregateScore: 60,
        darts: [],
      }],
    };
    const { database } = fakeDatabase({ rows: [aggregateRow] });
    const detail = await readMatchReplay("user-1", "match-1", database);

    expect(detail?.record.turns[0]).toMatchObject({
      dartsThrown: 3,
      aggregateScore: 60,
      darts: [],
    });
    const frames = buildMatchReplayTimeline(detail!.record);
    expect(frames).toHaveLength(3);
    expect(frames.every((frame) => frame.landing.kind === "unknown")).toBe(true);
    expect(frames.every((frame) => !("x" in frame.landing) && !("segment" in frame.landing))).toBe(true);
  });

  it("rejects an internally inconsistent stored record", async () => {
    const { database } = fakeDatabase({ rows: [{ ...replayRow, turns: [] }] });
    await expect(readMatchReplay("user-1", "match-1", database)).rejects.toBeInstanceOf(MatchHistoryError);

    const absentOwner = fakeDatabase({ rows: [{ ...replayRow, ownerSeat: 7 }] });
    await expect(readMatchReplay("user-1", "match-1", absentOwner.database)).rejects.toBeInstanceOf(MatchHistoryError);
  });
});
