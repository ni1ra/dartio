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

const countSchema = z.number().int().nonnegative();
const metricSchema = z.number().finite().nonnegative();
const x01MetricSchema = metricSchema.max(180);
const percentageSchema = metricSchema.max(100);
const resultSchema = z.enum(["won", "lost"]);
const drillModeSchema = z.enum(["checkoutLab", "doublesMatrix", "scoringSprint"]);
const drillUnits = {
  checkoutLab: "checkouts",
  doublesMatrix: "doubles",
  scoringSprint: "points",
} as const;
const drillMaximums = {
  checkoutLab: 12,
  doublesMatrix: 21,
  scoringSprint: 1_800,
} as const;

const finishingBedSchema = z.object({
  segment: z.number().int().refine((segment) => (segment >= 1 && segment <= 20) || segment === 25),
  // Only observed beds are returned. Zero rows would imply attempt/miss evidence
  // that the stored record does not contain.
  hits: countSchema.positive(),
  share: percentageSchema.positive(),
}).strict();

const recentFormSchema = z.object({
  completedAt: z.string().datetime(),
  mode: z.string().min(1),
  result: resultSchema,
}).strict();

const x01TrendSchema = z.object({
  completedAt: z.string().datetime(),
  threeDartAverage: x01MetricSchema,
  checkoutPercentage: percentageSchema,
  result: resultSchema,
}).strict();

const drillRecentSchema = z.object({
  completedAt: z.string().datetime(),
  value: metricSchema,
}).strict();

const modeTallySchema = z.object({
  mode: z.string().min(1),
  played: countSchema,
  won: countSchema,
  lost: countSchema,
  unscored: countSchema,
  visits: countSchema,
  dartsThrown: countSchema,
  winPercentage: percentageSchema.nullable(),
}).strict().refine(
  (mode) => mode.played === mode.won + mode.lost + mode.unscored,
  "A mode split must account for every session",
).refine(
  (mode) => (mode.won + mode.lost === 0) === (mode.winPercentage === null),
  "A mode win percentage exists only for competitive results",
).refine(
  (mode) => {
    const competitive = mode.won + mode.lost;
    const expected = competitive === 0 ? null : (mode.won * 100) / competitive;
    return expected === null
      ? mode.winPercentage === null
      : mode.winPercentage !== null && approximatelyEqual(mode.winPercentage, expected);
  },
  "A mode win percentage must agree with its won and lost results",
);

const drillProgressSchema = z.object({
  mode: drillModeSchema,
  unit: z.string().min(1),
  sessions: countSchema,
  latest: metricSchema.nullable(),
  best: metricSchema.nullable(),
  average: metricSchema.nullable(),
  recent: z.array(drillRecentSchema).max(12).refine(isChronological, "Drill values must be chronological"),
}).strict().refine(
  (drill) => drill.sessions === 0
    ? drill.latest === null && drill.best === null && drill.average === null && drill.recent.length === 0
    : drill.latest !== null && drill.best !== null && drill.average !== null && drill.recent.length > 0,
  "Drill aggregates must distinguish no sessions from a zero result",
).superRefine((drill, context) => {
  if (drill.unit !== drillUnits[drill.mode]) {
    context.addIssue({ code: "custom", path: ["unit"], message: "Drill unit must match its stored mode" });
  }
  const maximum = drillMaximums[drill.mode];
  const values = [drill.latest, drill.best, drill.average, ...drill.recent.map(({ value }) => value)];
  if (values.some((value) => value !== null && value > maximum)) {
    context.addIssue({ code: "custom", path: ["recent"], message: "Drill values cannot exceed the mode's physical maximum" });
  }
  if (drill.recent.length !== Math.min(drill.sessions, 12)) {
    context.addIssue({ code: "custom", path: ["recent"], message: "Drill trend must contain its complete recent window" });
  }
  if (drill.sessions === 0) return;
  if (drill.latest === null || drill.best === null || drill.average === null) return;
  const { latest: latestValue, best, average } = drill;

  const latest = drill.recent.at(-1)?.value;
  if (latest === undefined || !approximatelyEqual(latestValue, latest)) {
    context.addIssue({ code: "custom", path: ["latest"], message: "Latest must be the newest recent value" });
  }
  if (!atMost(latestValue, best)
    || drill.recent.some(({ value }) => !atMost(value, best))) {
    context.addIssue({ code: "custom", path: ["best"], message: "Best must cover latest and every recent value" });
  }
  if (!atMost(average, best)) {
    context.addIssue({ code: "custom", path: ["average"], message: "Average cannot exceed the best session" });
  }
});

const deepSchema = z.object({
  x01Matches: countSchema,
  firstNineAverage: x01MetricSchema,
  checkoutAttempts: countSchema,
  checkoutsHit: countSchema,
  checkoutPercentage: percentageSchema,
  bestVisit: x01MetricSchema,
  bestLegDarts: countSchema.positive().nullable(),
  busts: countSchema,
  finishingBeds: z.array(finishingBedSchema).max(21).refine(
    (beds) => new Set(beds.map(({ segment }) => segment)).size === beds.length,
    "A finishing bed can appear only once",
  ),
  // This is broader than aggregate entry: an exact straight/master checkout on
  // a non-double also has no observable legal double bed to attribute.
  unattributedCheckouts: countSchema,
  recentForm: z.array(recentFormSchema).max(12).refine(isChronological, "Recent form must be chronological"),
  x01Trend: z.array(x01TrendSchema).max(12).refine(isChronological, "X01 trend must be chronological"),
  modes: z.array(modeTallySchema).refine(
    (modes) => new Set(modes.map(({ mode }) => mode)).size === modes.length,
    "Each mode split appears exactly once",
  ),
  drills: z.array(drillProgressSchema).length(3).refine(
    (drills) => new Set(drills.map(({ mode }) => mode)).size === 3,
    "Every drill appears exactly once",
  ),
}).strict().superRefine((deep, context) => {
  if (deep.checkoutsHit > deep.checkoutAttempts) {
    context.addIssue({ code: "custom", path: ["checkoutsHit"], message: "Checkout hits cannot exceed attempts" });
  }
  const expectedCheckoutPercentage = deep.checkoutAttempts === 0
    ? 0
    : (deep.checkoutsHit * 100) / deep.checkoutAttempts;
  if (!approximatelyEqual(deep.checkoutPercentage, expectedCheckoutPercentage)) {
    context.addIssue({
      code: "custom",
      path: ["checkoutPercentage"],
      message: "Checkout percentage must agree with hits and attempts",
    });
  }

  const attributed = deep.finishingBeds.reduce((total, bed) => total + bed.hits, 0);
  if (attributed + deep.unattributedCheckouts !== deep.checkoutsHit) {
    context.addIssue({
      code: "custom",
      path: ["finishingBeds"],
      message: "Every successful checkout must be attributed once",
    });
  }

  if (deep.finishingBeds.length > 0) {
    const shareTotal = deep.finishingBeds.reduce((total, bed) => total + bed.share, 0);
    for (const [index, bed] of deep.finishingBeds.entries()) {
      const expected = (bed.hits * 100) / attributed;
      if (!approximatelyEqual(bed.share, expected)) {
        context.addIssue({
          code: "custom",
          path: ["finishingBeds", index, "share"],
          message: "Finishing-bed share must match its observed hits",
        });
      }
    }
    if (!approximatelyEqual(shareTotal, 100)) {
      context.addIssue({
        code: "custom",
        path: ["finishingBeds"],
        message: "Observed finishing-bed shares must total 100",
      });
    }
  }

  const x01Played = deep.modes.find(({ mode }) => mode === "x01")?.played ?? 0;
  if (x01Played !== deep.x01Matches) {
    context.addIssue({
      code: "custom",
      path: ["x01Matches"],
      message: "X01 totals must agree with the complete mode split",
    });
  }
  const x01Mode = deep.modes.find(({ mode }) => mode === "x01");
  const competitiveX01 = (x01Mode?.won ?? 0) + (x01Mode?.lost ?? 0);
  if (deep.x01Trend.length !== Math.min(competitiveX01, 12)) {
    context.addIssue({
      code: "custom",
      path: ["x01Trend"],
      message: "X01 trend must contain its complete recent competitive window",
    });
  }
});

const statsSchema = z.object({
  matchesPlayed: countSchema,
  competitiveMatches: countSchema,
  practiceSessions: countSchema,
  matchesWon: countSchema,
  winPercentage: percentageSchema,
  visits: countSchema,
  dartsThrown: countSchema,
  threeDartAverage: x01MetricSchema,
  historyLimit: countSchema.positive().nullable(),
  deep: deepSchema.nullable(),
}).strict().refine(
  (stats) => stats.competitiveMatches <= stats.matchesPlayed
    && stats.practiceSessions <= stats.matchesPlayed
    && stats.competitiveMatches + stats.practiceSessions <= stats.matchesPlayed,
  "Headline buckets cannot exceed all completed sessions",
).refine(
  (stats) => stats.matchesWon <= stats.competitiveMatches,
  "Wins cannot exceed competitive matches",
).superRefine((stats, context) => {
  const expectedWinPercentage = stats.competitiveMatches === 0
    ? 0
    : (stats.matchesWon * 100) / stats.competitiveMatches;
  if (!approximatelyEqual(stats.winPercentage, expectedWinPercentage)) {
    context.addIssue({
      code: "custom",
      path: ["winPercentage"],
      message: "Win percentage must agree with competitive results",
    });
  }
  if (stats.deep === null) return;
  if (stats.deep.recentForm.length !== Math.min(stats.competitiveMatches, 12)) {
    context.addIssue({
      code: "custom",
      path: ["deep", "recentForm"],
      message: "Recent form must contain its complete competitive window",
    });
  }
  const totals = stats.deep.modes.reduce(
    (sum, mode) => ({
      played: sum.played + mode.played,
      won: sum.won + mode.won,
      competitive: sum.competitive + mode.won + mode.lost,
      visits: sum.visits + mode.visits,
      dartsThrown: sum.dartsThrown + mode.dartsThrown,
    }),
    { played: 0, won: 0, competitive: 0, visits: 0, dartsThrown: 0 },
  );
  if (totals.played !== stats.matchesPlayed
    || totals.visits !== stats.visits
    || totals.dartsThrown !== stats.dartsThrown) {
    context.addIssue({
      code: "custom",
      path: ["deep", "modes"],
      message: "Mode splits must account for every session, visit, and dart",
    });
  }
  if (totals.won !== stats.matchesWon || totals.competitive !== stats.competitiveMatches) {
    context.addIssue({
      code: "custom",
      path: ["deep", "modes"],
      message: "Mode results must agree with the competitive headline",
    });
  }

  const drillSessions = stats.deep.drills.reduce((total, drill) => total + drill.sessions, 0);
  if (drillSessions !== stats.practiceSessions) {
    context.addIssue({
      code: "custom",
      path: ["deep", "drills"],
      message: "Practice sessions must equal the three known drill totals",
    });
  }
  for (const [index, drill] of stats.deep.drills.entries()) {
    const mode = stats.deep.modes.find(({ mode: id }) => id === drill.mode);
    const played = mode?.played ?? 0;
    const unscored = mode?.unscored ?? 0;
    if (drill.sessions !== played || drill.sessions !== unscored) {
      context.addIssue({
        code: "custom",
        path: ["deep", "drills", index, "sessions"],
        message: "Drill sessions must agree with their unscored mode split",
      });
    }
  }
});

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

function atMost(left: number, right: number): boolean {
  return left <= right || approximatelyEqual(left, right);
}

function isChronological(values: readonly { readonly completedAt: string }[]): boolean {
  return values.every((value, index) => index === 0
    || values[index - 1]!.completedAt.localeCompare(value.completedAt) <= 0);
}

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
