import { z } from "zod";
import { matchRecordSchema, type MatchRecord } from "@/domain/match-record";
import type { MatchReplayDetail } from "@/domain/match-replay";

/**
 * Talks to `/api/matches` from the device.
 *
 * Recording is deliberately best-effort. Free play requires no account, so a signed-out
 * player simply has no history to write — a 401 is the expected answer, not a fault, and
 * nothing about a finished match should be interrupted to say so.
 */

const playerSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  isBot: z.boolean(),
  botLevel: z.number().int().nullable(),
  isYou: z.boolean(),
}).strict();

const entrySchema = z.object({
  id: z.string(),
  mode: z.string(),
  completedAt: z.string(),
  players: z.array(playerSchema),
  winnerSeat: z.number().int().nullable(),
  turnCount: z.number().int(),
  dartCount: z.number().int(),
}).strict();

const historySchema = z.object({ matches: z.array(entrySchema) }).strict();

export type MatchHistoryEntryView = z.infer<typeof entrySchema>;

const replayDetailSchema = z.object({
  id: z.string().min(1),
  completedAt: z.string().datetime(),
  ownerSeat: z.number().int().min(0).max(7),
  record: matchRecordSchema,
}).strict().refine(
  (detail) => detail.record.players.some(
    (player) => player.seat === detail.ownerSeat && !player.isBot,
  ),
  "The replay owner must occupy a recorded human seat",
);

const replayResponseSchema = z.object({ match: replayDetailSchema }).strict();

export type FetchMatchReplayResult =
  | { readonly status: "ready"; readonly match: MatchReplayDetail }
  | { readonly status: "signed-out" | "not-found" | "unavailable" };

export type RecordMatchOutcome = "recorded" | "signed-out" | "rejected" | "unavailable";

export interface MatchClientOptions {
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

/**
 * Files a finished match. Returns why it did not land rather than throwing, because
 * every caller's correct response to a failure is the same: nothing.
 */
export async function recordCompletedMatch(
  record: MatchRecord,
  ownerSeat: number,
  options: MatchClientOptions = {},
): Promise<RecordMatchOutcome> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/matches", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record, ownerSeat }),
      signal: options.signal,
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 201) return "recorded";
  if (response.status === 401) return "signed-out";
  if (response.status === 400) return "rejected";
  return "unavailable";
}

const deepSchema = z.object({
  x01Matches: z.number(),
  firstNineAverage: z.number(),
  checkoutAttempts: z.number(),
  checkoutsHit: z.number(),
  checkoutPercentage: z.number(),
  bestVisit: z.number(),
  bestLegDarts: z.number().nullable(),
  busts: z.number(),
  modes: z.array(z.object({ mode: z.string(), played: z.number(), won: z.number() }).strict()),
}).strict();

const statsSchema = z.object({
  matchesPlayed: z.number(),
  matchesWon: z.number(),
  winPercentage: z.number(),
  visits: z.number(),
  dartsThrown: z.number(),
  threeDartAverage: z.number(),
  historyLimit: z.number().nullable(),
  deep: deepSchema.nullable(),
}).strict();

export type CareerStatsView = z.infer<typeof statsSchema>;

/**
 * The player's career figures, or why they are not available.
 *
 * `locked` is not the same as `unavailable`: a Free player successfully read their
 * stats and the deep ones were withheld, which the surface should explain rather
 * than present as a failure. That distinction is carried by `deep` being null in a
 * 200, never by an error.
 */
export async function fetchCareerStats(
  options: MatchClientOptions = {},
): Promise<CareerStatsView | null> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/stats", { cache: "no-store", signal: options.signal });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const parsed = statsSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Returns null when history cannot be read, so a surface can say so instead of rendering an empty past. */
export async function fetchMatchHistory(
  options: MatchClientOptions & { readonly limit?: number } = {},
): Promise<readonly MatchHistoryEntryView[] | null> {
  const fetcher = options.fetcher ?? fetch;
  const query = options.limit === undefined ? "" : `?limit=${options.limit}`;
  let response: Response;
  try {
    response = await fetcher(`/api/matches${query}`, { cache: "no-store", signal: options.signal });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  const parsed = historySchema.safeParse(payload);
  return parsed.success ? parsed.data.matches : null;
}

/** Reads one owner-visible replay while preserving why no replay can be shown. */
export async function fetchMatchReplay(
  id: string,
  options: MatchClientOptions = {},
): Promise<FetchMatchReplayResult> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`/api/matches/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    return { status: "unavailable" };
  }
  if (response.status === 401) return { status: "signed-out" };
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) return { status: "unavailable" };
  const payload: unknown = await response.json().catch(() => null);
  const parsed = replayResponseSchema.safeParse(payload);
  return parsed.success
    ? { status: "ready", match: parsed.data.match as MatchReplayDetail }
    : { status: "unavailable" };
}
