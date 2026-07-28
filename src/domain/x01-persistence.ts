import { z } from "zod";
import { BOARD_CLOCKWISE } from "./darts";
import type { X01Log } from "./x01-log";

/**
 * Versioned serialization of a match log.
 *
 * A match used to live in one `useState`, so a refresh, an evicted background
 * tab, or a dropped connection lost the leg. Persisting the log rather than the
 * state means a resumed match is byte-for-byte the match that was interrupted,
 * and it keeps the stored shape small enough to sit in local storage.
 *
 * The version is checked on read. A stored log from an older shape is discarded
 * rather than coerced: resuming into a subtly wrong score is worse for a player
 * than starting again, and there is no migration worth writing until a real one
 * is needed.
 */
export const X01_LOG_VERSION = 1;

const boardNumbers = [0, 25, ...BOARD_CLOCKWISE] as const;
const segmentSchema = z.number().int().refine(
  (value) => (boardNumbers as readonly number[]).includes(value),
  "Not a scoring bed",
);

const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dart"),
    segment: segmentSchema,
    multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }).strict().refine(
    (value) => (value.segment !== 0 || value.multiplier === 1) && (value.segment !== 25 || value.multiplier !== 3),
    "Impossible bed and multiplier",
  ),
  z.object({
    kind: z.literal("visit"),
    score: z.number().int().min(0).max(180),
    dartsThrown: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }).strict(),
]);

const ruleSchema = z.enum(["straight", "double", "master"]);

const logSchema = z.object({
  version: z.literal(X01_LOG_VERSION),
  options: z.object({
    startingScore: z.number().int().min(2).max(9999),
    legsToWin: z.number().int().min(1).max(20),
    setsToWin: z.number().int().min(1).max(20),
    inRule: ruleSchema,
    outRule: ruleSchema,
  }).strict(),
  players: z.array(z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(64),
  }).strict()).min(1).max(8),
  // A long match is thousands of darts; the cap stops a corrupted or hostile
  // store entry from turning a page load into an unbounded replay.
  events: z.array(eventSchema).max(5000),
}).strict();

export function serializeX01Log(log: X01Log): string {
  return JSON.stringify({
    version: X01_LOG_VERSION,
    options: log.options,
    players: log.players,
    events: log.events,
  });
}

/** Returns null for anything that is not a current, well-formed log. */
export function deserializeX01Log(value: string | null | undefined): X01Log | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const result = logSchema.safeParse(parsed);
  if (!result.success) return null;
  const { options, players, events } = result.data;
  return { options, players, events } as X01Log;
}
