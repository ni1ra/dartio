import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { dartRows } from "@/db/rows";
import { darts, matches, players, turns } from "@/db/schema";
import type { MatchRecord } from "@/domain/match-record";
import type { StatMatch, StatTurn } from "@/domain/match-stats";
import { recordFailure } from "./observability";

/**
 * Writes a finished match down, and reads back what a player has played.
 *
 * `matches`, `players`, `turns`, and `darts` shipped in migration 0005 and then sat
 * empty: the schema promised history, statistics, and cross-device continuity while
 * nothing ever wrote a row. This is the writer.
 *
 * Ownership is server-side and never negotiable — the user comes from the session,
 * so a request cannot file a match into somebody else's history.
 */

export type Database = ReturnType<typeof createDatabase>;

export interface MatchHistoryPlayer {
  readonly seat: number;
  readonly displayName: string;
  readonly isBot: boolean;
  readonly botLevel: number | null;
  readonly isYou: boolean;
}

export interface MatchHistoryEntry {
  readonly id: string;
  readonly mode: string;
  readonly completedAt: string;
  readonly players: readonly MatchHistoryPlayer[];
  readonly winnerSeat: number | null;
  readonly turnCount: number;
  readonly dartCount: number;
}

/** Raised when the database is reachable but refused the write, so a route can answer 503 rather than 500. */
export class MatchHistoryError extends Error {
  readonly status = 503;
  constructor(options?: ErrorOptions) {
    super("Match history is unavailable", options);
    this.name = "MatchHistoryError";
  }
}

export const HISTORY_PAGE_SIZE = 20;

/**
 * Records one finished match and returns its id.
 *
 * Every id is generated here rather than by the database because the rows reference
 * each other: knowing the ids up front turns four dependent round trips into one
 * batch, and Neon's HTTP driver runs a batch inside a single transaction — so a
 * match never lands with half its darts missing.
 *
 * The winner is set by a final update rather than in the insert. `matches` points at
 * a row in `players`, and `players` points back at the match, so one of the two has
 * to arrive incomplete.
 */
export async function recordMatch(
  userId: string,
  record: MatchRecord,
  ownerSeat: number,
  db: Database = createDatabase(),
): Promise<string> {
  const matchId = randomUUID();
  const playerIds = new Map(record.players.map((player) => [player.seat, randomUUID()]));

  const playerRows = record.players.map((player) => ({
    id: playerIds.get(player.seat)!,
    matchId,
    // Only the seat the requester actually occupied is linked to their account. Local
    // opponents and bots are recorded as people who played, not as people with logins.
    userId: player.seat === ownerSeat ? userId : null,
    seat: player.seat,
    displayName: player.displayName,
    isBot: player.isBot,
    botLevel: player.botLevel ?? null,
  }));

  const turnIds = new Map(record.turns.map((turn) => [turn.turnNumber, randomUUID()]));
  const turnRows = record.turns.map((turn) => ({
    id: turnIds.get(turn.turnNumber)!,
    matchId,
    playerId: playerIds.get(turn.seat)!,
    turnNumber: turn.turnNumber,
    legNumber: turn.legNumber,
    scoreBefore: turn.scoreBefore,
    scoreAfter: turn.scoreAfter,
    bust: turn.bust,
    dartsThrown: turn.dartsThrown,
    aggregateScore: turn.aggregateScore ?? null,
  }));

  const thrownRows = record.turns.flatMap((turn) => dartRows(turnIds.get(turn.turnNumber)!, turn.darts));

  const winnerPlayerId = record.winnerSeat === undefined ? null : playerIds.get(record.winnerSeat) ?? null;

  const statements = [
    db.insert(matches).values({
      id: matchId,
      mode: record.mode,
      status: winnerPlayerId ? "complete" : "abandoned",
      options: record.options,
      completedAt: new Date(),
    }),
    db.insert(players).values(playerRows),
    db.insert(turns).values(turnRows),
    ...(thrownRows.length > 0 ? [db.insert(darts).values(thrownRows)] : []),
    ...(winnerPlayerId
      ? [db.update(matches).set({ winnerPlayerId }).where(eq(matches.id, matchId))]
      : []),
  ];

  try {
    // The tuple type only exists to prove the batch is non-empty, which the first
    // three statements already guarantee.
    await db.batch(statements as unknown as [(typeof statements)[number]]);
  } catch (cause) {
    recordFailure("match.record_failed", cause, { userId, mode: record.mode, count: record.turns.length });
    throw new MatchHistoryError({ cause });
  }
  return matchId;
}

/** The player's own matches, most recent first. */
export async function listMatches(
  userId: string,
  limit: number = HISTORY_PAGE_SIZE,
  db: Database = createDatabase(),
): Promise<readonly MatchHistoryEntry[]> {
  let rows: MatchRow[];
  try {
    rows = await queryMatches(userId, limit, db);
  } catch (cause) {
    throw new MatchHistoryError({ cause });
  }
  return rows.map(toEntry);
}

interface MatchRow extends Record<string, unknown> {
  id: string;
  mode: string;
  completedAt: string | Date | null;
  winnerSeat: number | null;
  turnCount: number;
  dartCount: number;
  players: readonly { seat: number; displayName: string; isBot: boolean; botLevel: number | null; userId: string | null }[];
}

async function queryMatches(userId: string, limit: number, db: Database): Promise<MatchRow[]> {
  // One statement rather than a query per match: the roster and the counts are
  // aggregated in the database, so a twenty-match page is one round trip.
  const result = await db.execute<MatchRow>(sql`
    with mine as (
      select distinct ${players.matchId} as match_id
      from ${players}
      where ${players.userId} = ${userId}
    )
    select
      ${matches.id} as "id",
      ${matches.mode} as "mode",
      ${matches.completedAt} as "completedAt",
      winner.seat as "winnerSeat",
      (select count(*)::int from ${turns} where ${turns.matchId} = ${matches.id}) as "turnCount",
      (select count(*)::int from ${darts}
         join ${turns} as dart_turn on dart_turn.id = ${darts.turnId}
        where dart_turn.match_id = ${matches.id}) as "dartCount",
      (select coalesce(json_agg(json_build_object(
          'seat', roster.seat,
          'displayName', roster.display_name,
          'isBot', roster.is_bot,
          'botLevel', roster.bot_level,
          'userId', roster.user_id
        ) order by roster.seat), '[]'::json)
         from ${players} as roster where roster.match_id = ${matches.id}) as "players"
    from ${matches}
    join mine on mine.match_id = ${matches.id}
    left join ${players} as winner on winner.id = ${matches.winnerPlayerId}
    order by ${desc(matches.completedAt)}
    limit ${limit}
  `);
  return [...result.rows];
}

interface StatRow extends Record<string, unknown> {
  id: string;
  mode: string;
  outRule: string | null;
  won: boolean;
  turns: readonly StatTurn[];
}

/**
 * The player's own visits, match by match, for the statistics computed from them.
 *
 * Deliberately not `listMatches` with more columns: history is about opponents and
 * results, statistics are about what this player threw. Joining from `players`
 * rather than from `matches` is what keeps a local opponent's visits out of the
 * numbers — a two-person match on one phone stores both seats, and only one of them
 * belongs to this account.
 */
export async function readStatMatches(
  userId: string,
  limit: number | null,
  db: Database = createDatabase(),
): Promise<readonly StatMatch[]> {
  try {
    const result = await db.execute<StatRow>(sql`
      select
        ${matches.id} as "id",
        ${matches.mode} as "mode",
        ${matches.options}->>'outRule' as "outRule",
        (${matches.winnerPlayerId} = ${players.id}) as "won",
        coalesce(
          json_agg(
            json_build_object(
              'legNumber', ${turns.legNumber},
              'scoreBefore', ${turns.scoreBefore},
              'scoreAfter', ${turns.scoreAfter},
              'bust', ${turns.bust},
              'dartsThrown', ${turns.dartsThrown}
            ) order by ${turns.turnNumber}
          ) filter (where ${turns.id} is not null),
          '[]'::json
        ) as "turns"
      from ${players}
      join ${matches} on ${matches.id} = ${players.matchId}
      left join ${turns} on ${turns.playerId} = ${players.id}
      where ${players.userId} = ${userId}
      group by ${matches.id}, ${players.id}
      order by ${desc(matches.completedAt)}
      ${limit === null ? sql`` : sql`limit ${limit}`}
    `);
    return result.rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      outRule: row.outRule === "straight" || row.outRule === "master" || row.outRule === "double" ? row.outRule : null,
      won: row.won === true,
      turns: row.turns,
    }));
  } catch (cause) {
    throw new MatchHistoryError({ cause });
  }
}

function toEntry(row: MatchRow): MatchHistoryEntry {
  return {
    id: row.id,
    mode: row.mode,
    completedAt: (row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt ?? 0)).toISOString(),
    winnerSeat: row.winnerSeat,
    turnCount: row.turnCount,
    dartCount: row.dartCount,
    players: row.players.map((player) => ({
      seat: player.seat,
      displayName: player.displayName,
      isBot: player.isBot,
      botLevel: player.botLevel,
      isYou: player.userId !== null,
    })),
  };
}
