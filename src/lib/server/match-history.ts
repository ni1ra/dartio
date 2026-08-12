import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { dartRows } from "@/db/rows";
import { darts, matches, players, turns } from "@/db/schema";
import { parseMatchRecord, type MatchRecord } from "@/domain/match-record";
import type { MatchReplayDetail } from "@/domain/match-replay";
import type { MatchResult, StatMatch, StatTurn } from "@/domain/match-stats";
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

/**
 * Reconstructs one completed match only when the reader occupied one of its seats.
 *
 * Missing ids and matches owned by somebody else both produce `null`; callers must
 * not reveal which case occurred. The whole record is aggregated in one statement
 * so replay length does not turn into one database round trip per visit.
 */
export async function readMatchReplay(
  userId: string,
  matchId: string,
  db: Database = createDatabase(),
): Promise<MatchReplayDetail | null> {
  try {
    const result = await db.execute<MatchReplayRow>(sql`
      select
        ${matches.id} as "id",
        ${matches.mode} as "mode",
        ${matches.options} as "options",
        ${matches.completedAt} as "completedAt",
        winner.seat as "winnerSeat",
        reader.seat as "ownerSeat",
        (select coalesce(json_agg(json_build_object(
            'seat', roster.seat,
            'displayName', roster.display_name,
            'isBot', roster.is_bot,
            'botLevel', roster.bot_level
          ) order by roster.seat), '[]'::json)
           from ${players} as roster
          where roster.match_id = ${matches.id}) as "players",
        (select coalesce(json_agg(json_build_object(
            'seat', thrower.seat,
            'turnNumber', visit.turn_number,
            'legNumber', visit.leg_number,
            'scoreBefore', visit.score_before,
            'scoreAfter', visit.score_after,
            'bust', visit.bust,
            'dartsThrown', visit.darts_thrown,
            'aggregateScore', visit.aggregate_score,
            'darts', (select coalesce(json_agg(json_build_object(
                'ordinal', thrown.ordinal,
                'segment', thrown.segment,
                'multiplier', thrown.multiplier,
                'x', thrown.x_microunits,
                'y', thrown.y_microunits
              ) order by thrown.ordinal), '[]'::json)
                from ${darts} as thrown
               where thrown.turn_id = visit.id)
          ) order by visit.turn_number), '[]'::json)
           from ${turns} as visit
           join ${players} as thrower on thrower.id = visit.player_id
          where visit.match_id = ${matches.id}) as "turns"
      from ${matches}
      join ${players} as reader
        on reader.match_id = ${matches.id} and reader.user_id = ${userId}
      left join ${players} as winner on winner.id = ${matches.winnerPlayerId}
      where ${matches.id} = ${matchId}
        and ${matches.completedAt} is not null
      order by reader.seat
      limit 1
    `);
    const row = result.rows[0];
    return row ? replayFromRow(row) : null;
  } catch (cause) {
    throw new MatchHistoryError({ cause });
  }
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

interface MatchReplayDartRow {
  readonly ordinal: number;
  readonly segment: number;
  readonly multiplier: number;
  readonly x: number | null;
  readonly y: number | null;
}

interface MatchReplayTurnRow {
  readonly seat: number;
  readonly turnNumber: number;
  readonly legNumber: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
  readonly dartsThrown: number;
  readonly aggregateScore: number | null;
  readonly darts: readonly MatchReplayDartRow[];
}

interface MatchReplayRow extends Record<string, unknown> {
  readonly id: string;
  readonly mode: string;
  readonly options: unknown;
  readonly completedAt: string | Date;
  readonly winnerSeat: number | null;
  readonly ownerSeat: number;
  readonly players: readonly {
    readonly seat: number;
    readonly displayName: string;
    readonly isBot: boolean;
    readonly botLevel: number | null;
  }[];
  readonly turns: readonly MatchReplayTurnRow[];
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
    where ${matches.completedAt} is not null
    order by ${desc(matches.completedAt)}
    limit ${limit}
  `);
  return [...result.rows];
}

interface StatRow extends Record<string, unknown> {
  id: string;
  mode: string;
  completedAt: string | Date;
  outRule: string | null;
  result: string;
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
        ${matches.completedAt} as "completedAt",
        ${matches.options}->>'outRule' as "outRule",
        case
          when ${matches.winnerPlayerId} = ${players.id} then 'won'
          when ${matches.winnerPlayerId} is null then 'unscored'
          else 'lost'
        end as "result",
        coalesce(
          json_agg(
            json_build_object(
              'legNumber', ${turns.legNumber},
              'scoreBefore', ${turns.scoreBefore},
              'scoreAfter', ${turns.scoreAfter},
              'bust', ${turns.bust},
              'dartsThrown', ${turns.dartsThrown},
              'darts', (select coalesce(json_agg(json_build_object(
                  'ordinal', thrown.ordinal,
                  'segment', thrown.segment,
                  'multiplier', thrown.multiplier
                ) order by thrown.ordinal), '[]'::json)
                  from ${darts} as thrown
                 where thrown.turn_id = ${turns.id})
            ) order by ${turns.turnNumber}
          ) filter (where ${turns.id} is not null),
          '[]'::json
        ) as "turns"
      from ${players}
      join ${matches} on ${matches.id} = ${players.matchId}
      left join ${turns} on ${turns.playerId} = ${players.id}
      where ${players.userId} = ${userId}
        and ${matches.completedAt} is not null
      group by ${matches.id}, ${players.id}
      order by ${desc(matches.completedAt)}
      ${limit === null ? sql`` : sql`limit ${limit}`}
    `);
    return result.rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      completedAt: (row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt)).toISOString(),
      outRule: row.outRule === "straight" || row.outRule === "master" || row.outRule === "double" ? row.outRule : null,
      result: statResult(row.result),
      turns: row.turns,
    }));
  } catch (cause) {
    throw new MatchHistoryError({ cause });
  }
}

/** The SQL case emits exactly these values; anything else is a broken read, not practice. */
function statResult(value: string): MatchResult {
  if (value === "won" || value === "lost" || value === "unscored") return value;
  throw new Error("Stored match result is invalid");
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

function replayFromRow(row: MatchReplayRow): MatchReplayDetail {
  const record = parseMatchRecord({
    mode: row.mode,
    options: row.options,
    players: row.players.map((player) => ({
      seat: player.seat,
      displayName: player.displayName,
      isBot: player.isBot,
      ...(player.botLevel === null ? {} : { botLevel: player.botLevel }),
    })),
    turns: row.turns.map((turn) => ({
      seat: turn.seat,
      turnNumber: turn.turnNumber,
      legNumber: turn.legNumber,
      scoreBefore: turn.scoreBefore,
      scoreAfter: turn.scoreAfter,
      bust: turn.bust,
      dartsThrown: turn.dartsThrown,
      ...(turn.aggregateScore === null ? {} : { aggregateScore: turn.aggregateScore }),
      darts: turn.darts.map((thrown) => ({
        ordinal: thrown.ordinal,
        segment: thrown.segment,
        multiplier: thrown.multiplier,
        ...(thrown.x === null ? {} : { x: thrown.x / 1_000_000 }),
        ...(thrown.y === null ? {} : { y: thrown.y / 1_000_000 }),
      })),
    })),
    ...(row.winnerSeat === null ? {} : { winnerSeat: row.winnerSeat }),
  });
  const completedAt = row.completedAt instanceof Date ? row.completedAt : new Date(row.completedAt);
  const owner = record?.players.find((player) => player.seat === row.ownerSeat);
  if (!record || !owner || owner.isBot || !Number.isInteger(row.ownerSeat) || Number.isNaN(completedAt.valueOf())) {
    // Stored rows crossing this branch violate the same boundary writes use. Treat
    // that as an unavailable record instead of returning a replay with invented data.
    throw new Error("Stored match record is invalid");
  }
  return { id: row.id, completedAt: completedAt.toISOString(), ownerSeat: row.ownerSeat, record };
}
