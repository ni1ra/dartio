import { z } from "zod";
import { BOARD_CLOCKWISE } from "./darts";

/**
 * One shape every mode reduces to before it is written down.
 *
 * Modes do not agree on much — X01 counts down, Cricket closes numbers, Bob's 27
 * can go negative — so a history table that understood each of them would have to
 * be edited every time a mode is added. This is the one thing they do agree on:
 * somebody sat in a seat, threw a visit, and the number in front of them changed.
 * Each mode owns the adapter that produces this from its own log; nothing here
 * knows what any mode's rules are, and the server never learns them.
 */

/** A visit's grouping unit. X01 counts legs; modes without legs record leg 1 throughout. */
export const MAX_TURNS = 2000;
export const MAX_PLAYERS = 8;

export interface RecordedDart {
  readonly ordinal: 1 | 2 | 3;
  readonly segment: number;
  readonly multiplier: 1 | 2 | 3;
  /** Where the dart physically landed, when it was thrown at a board rather than typed. */
  readonly x?: number;
  readonly y?: number;
}

export interface RecordedTurn {
  readonly seat: number;
  /** 1-based and sequential across the whole match, which is what orders the replay. */
  readonly turnNumber: number;
  readonly legNumber: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
  readonly dartsThrown: 1 | 2 | 3;
  /**
   * Set only when the visit was entered as a total rather than dart by dart. Without
   * it a typed 60 that busted would be unrecoverable, because a bust restores the
   * score and leaves nothing else behind to say what was claimed.
   */
  readonly aggregateScore?: number;
  readonly darts: readonly RecordedDart[];
}

export interface RecordedPlayer {
  readonly seat: number;
  readonly displayName: string;
  readonly isBot: boolean;
  readonly botLevel?: number;
}

export interface MatchRecord {
  readonly mode: string;
  readonly options: Record<string, unknown>;
  readonly players: readonly RecordedPlayer[];
  readonly turns: readonly RecordedTurn[];
  readonly winnerSeat?: number;
}

/** What a caller knows about a seat that the log itself does not: whether it was played by a machine. */
export interface SeatIdentity {
  readonly isBot?: boolean;
  readonly botLevel?: number;
}

const boardNumbers = [0, 25, ...BOARD_CLOCKWISE] as const;

const dartSchema = z.object({
  ordinal: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  segment: z.number().int().refine((v) => (boardNumbers as readonly number[]).includes(v), "Not a scoring bed"),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}).strict().refine(
  // The same impossible combinations the darts table refuses, rejected before it is asked to.
  (d) => (d.segment !== 0 || d.multiplier === 1) && (d.segment !== 25 || d.multiplier !== 3),
  "Impossible bed and multiplier",
);

const turnSchema = z.object({
  seat: z.number().int().min(0).max(MAX_PLAYERS - 1),
  turnNumber: z.number().int().min(1).max(MAX_TURNS),
  legNumber: z.number().int().min(1).max(MAX_TURNS),
  scoreBefore: z.number().int().min(-9999).max(9999),
  scoreAfter: z.number().int().min(-9999).max(9999),
  bust: z.boolean(),
  dartsThrown: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  aggregateScore: z.number().int().min(0).max(180).optional(),
  darts: z.array(dartSchema).max(3),
}).strict().refine(
  (t) => t.darts.length === 0 || t.darts.length === t.dartsThrown,
  "A visit recorded dart by dart must record every dart it threw",
);

const playerSchema = z.object({
  seat: z.number().int().min(0).max(MAX_PLAYERS - 1),
  displayName: z.string().min(1).max(64),
  isBot: z.boolean(),
  botLevel: z.number().int().min(1).max(20).optional(),
}).strict();

export const matchRecordSchema = z.object({
  mode: z.string().min(1).max(32),
  options: z.record(z.string(), z.unknown()),
  players: z.array(playerSchema).min(1).max(MAX_PLAYERS),
  // A record with no visits is not a match anybody played, so it is refused rather than stored.
  turns: z.array(turnSchema).min(1).max(MAX_TURNS),
  winnerSeat: z.number().int().min(0).max(MAX_PLAYERS - 1).optional(),
}).strict().superRefine((record, ctx) => {
  const seats = new Set(record.players.map((p) => p.seat));
  if (seats.size !== record.players.length) {
    ctx.addIssue({ code: "custom", message: "Two players cannot share a seat" });
  }
  // A turn or a winner pointing at an empty seat would insert a row referencing
  // nobody, so it is refused here rather than by a foreign key at write time.
  for (const turn of record.turns) {
    if (!seats.has(turn.seat)) {
      ctx.addIssue({ code: "custom", message: `Turn ${turn.turnNumber} was thrown from an empty seat` });
      break;
    }
  }
  if (record.winnerSeat !== undefined && !seats.has(record.winnerSeat)) {
    ctx.addIssue({ code: "custom", message: "The winner is not one of the players" });
  }
  const numbers = record.turns.map((t) => t.turnNumber);
  if (new Set(numbers).size !== numbers.length) {
    ctx.addIssue({ code: "custom", message: "Turn numbers must be unique within a match" });
  }
});

export type ParsedMatchRecord = z.infer<typeof matchRecordSchema>;

/** Returns null for anything that is not a well-formed record, the way the log readers do. */
export function parseMatchRecord(value: unknown): MatchRecord | null {
  const result = matchRecordSchema.safeParse(value);
  return result.success ? (result.data as MatchRecord) : null;
}

/** Shared by every mode adapter: a seat's identity, with the caller's knowledge folded in. */
export function recordedPlayer(seat: number, displayName: string, identity?: SeatIdentity): RecordedPlayer {
  const isBot = identity?.isBot ?? false;
  return {
    seat,
    displayName,
    isBot,
    // A level on a human seat would be a lie, so it is dropped rather than carried.
    ...(isBot && identity?.botLevel !== undefined ? { botLevel: identity.botLevel } : {}),
  };
}

/** Shared by every mode adapter: darts in throwing order, with their landing point when there was one. */
export function recordedDarts(darts: readonly { segment: number; multiplier: number; x?: number; y?: number }[]): readonly RecordedDart[] {
  return darts.map((dart, index) => ({
    ordinal: (index + 1) as 1 | 2 | 3,
    segment: dart.segment,
    multiplier: dart.multiplier as 1 | 2 | 3,
    ...(dart.x === undefined ? {} : { x: dart.x }),
    ...(dart.y === undefined ? {} : { y: dart.y }),
  }));
}
