import { DRILLS, type DrillId } from "./drills";
import type { OutRule } from "./x01";

/**
 * A player's career, computed only from completed rows that outlived a match.
 *
 * The stored record says what landed, not what the player aimed at. Consequently
 * these statistics can describe observed finishing doubles but never checkout
 * target attempts or double accuracy. Aggregate visits remain useful for scoring
 * totals while their finishing bed stays deliberately unattributed.
 */

export type MatchResult = "won" | "lost" | "unscored";

/** One exact dart stored for a visit. Aggregate visits have no dart rows. */
export interface StatDart {
  readonly ordinal: 1 | 2 | 3;
  readonly segment: number;
  readonly multiplier: 1 | 2 | 3;
}

/** One stored visit, as the signed-in player who threw it. */
export interface StatTurn {
  readonly legNumber: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
  readonly dartsThrown: number;
  readonly darts: readonly StatDart[];
}

export interface StatMatch {
  readonly id: string;
  readonly mode: string;
  /** Canonical ISO timestamp supplied by the server reader. */
  readonly completedAt: string;
  /** Competitive rows name a winner or loser; practice rows are unscored. */
  readonly result: MatchResult;
  /** X01 only; the rule decides which scores were finishable. Null otherwise. */
  readonly outRule: OutRule | null;
  /** Only the visits this player threw. */
  readonly turns: readonly StatTurn[];
}

export interface ModeTally {
  readonly mode: string;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly unscored: number;
  readonly visits: number;
  readonly dartsThrown: number;
  /** Null means this mode has no competitive result, not a zero-percent record. */
  readonly winPercentage: number | null;
}

export interface FinishingBed {
  readonly segment: number;
  readonly hits: number;
  /** Share of attributable double finishes, 0–100. */
  readonly share: number;
}

export interface RecentFormEntry {
  readonly completedAt: string;
  readonly mode: string;
  readonly result: "won" | "lost";
}

export interface X01TrendEntry {
  readonly completedAt: string;
  readonly threeDartAverage: number;
  readonly checkoutPercentage: number;
  readonly result: "won" | "lost";
}

export interface DrillRecentValue {
  readonly completedAt: string;
  readonly value: number;
}

export interface DrillProgress {
  readonly mode: DrillId;
  readonly unit: string;
  readonly sessions: number;
  readonly latest: number | null;
  readonly best: number | null;
  readonly average: number | null;
  /** Oldest to newest so a chart never has to guess the direction of time. */
  readonly recent: readonly DrillRecentValue[];
}

export interface X01Stats {
  readonly matches: number;
  readonly threeDartAverage: number;
  /** Average over the first three visits of each leg, before checkout distorts it. */
  readonly firstNineAverage: number;
  readonly checkoutAttempts: number;
  readonly checkoutsHit: number;
  /** Percentage, 0–100. Zero attempts reads as 0 rather than as undefined. */
  readonly checkoutPercentage: number;
  readonly bestVisit: number;
  /** Fewest darts taken to win a leg, or null if no leg has been won. */
  readonly bestLegDarts: number | null;
  readonly busts: number;
  readonly finishingBeds: readonly FinishingBed[];
  /**
   * Successful checkouts without an observable legal double finishing bed. This
   * includes aggregate visits and exact straight/master finishes on a non-double.
   */
  readonly unattributedCheckouts: number;
  readonly trend: readonly X01TrendEntry[];
}

export interface CareerStats {
  /** Every completed session, including winnerless non-drill records. */
  readonly matchesPlayed: number;
  readonly competitiveMatches: number;
  /** Sessions whose stored mode is one of Dartio's three known drills. */
  readonly practiceSessions: number;
  readonly matchesWon: number;
  /** Wins divided by won + lost only; practice can never lower it. */
  readonly winPercentage: number;
  readonly visits: number;
  readonly dartsThrown: number;
  readonly x01: X01Stats;
  readonly modes: readonly ModeTally[];
  readonly recentForm: readonly RecentFormEntry[];
  readonly drills: readonly DrillProgress[];
}

const RECENT_WINDOW = 12;
const DRILL_ORDER: readonly DrillId[] = ["checkoutLab", "doublesMatrix", "scoringSprint"];

/** A visit scores nothing when it busts, because a bust restores its starting score. */
function scored(turn: StatTurn): number {
  return turn.bust ? 0 : turn.scoreBefore - turn.scoreAfter;
}

/** The band the out rule can finish from in three darts. */
function finishBand(outRule: OutRule): { readonly min: number; readonly max: number } {
  return { min: outRule === "straight" ? 1 : 2, max: outRule === "double" ? 170 : 180 };
}

function isCompetitive(result: MatchResult): result is "won" | "lost" {
  return result !== "unscored";
}

function isDrillMode(mode: string): mode is DrillId {
  return (DRILL_ORDER as readonly string[]).includes(mode);
}

/**
 * Mode is authoritative for drills. The generic record boundary can carry a
 * winner on any shape-valid mode, but that cannot turn a practice ledger into a
 * competitive result.
 */
function effectiveResult(match: StatMatch): MatchResult {
  return isDrillMode(match.mode) ? "unscored" : match.result;
}

/**
 * Returns the exact darts only when they account for physical darts 1..N once.
 * A partial/corrupt chronology must not be upgraded into a claimed finishing bed.
 */
function exactDarts(turn: StatTurn): readonly StatDart[] | null {
  if (turn.darts.length !== turn.dartsThrown) return null;
  const ordered = [...turn.darts].sort((left, right) => left.ordinal - right.ordinal);
  return ordered.every((thrown, index) => thrown.ordinal === index + 1) ? ordered : null;
}

function isLegalDouble(dart: StatDart | undefined): dart is StatDart {
  return dart !== undefined
    && dart.multiplier === 2
    && ((dart.segment >= 1 && dart.segment <= 20) || dart.segment === 25);
}

/** ISO timestamps sort lexically; id makes equal instants deterministic. */
function chronological(matches: readonly StatMatch[]): StatMatch[] {
  return [...matches].sort((left, right) =>
    left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id));
}

export function careerStats(matches: readonly StatMatch[]): CareerStats {
  const modes = new Map<string, {
    played: number;
    won: number;
    lost: number;
    unscored: number;
    visits: number;
    dartsThrown: number;
  }>();
  let visits = 0;
  let dartsThrown = 0;
  let matchesWon = 0;
  let competitiveMatches = 0;
  let practiceSessions = 0;

  for (const match of matches) {
    const result = effectiveResult(match);
    const matchDarts = match.turns.reduce((total, turn) => total + turn.dartsThrown, 0);
    const tally = modes.get(match.mode) ?? {
      played: 0, won: 0, lost: 0, unscored: 0, visits: 0, dartsThrown: 0,
    };
    tally.played += 1;
    tally[result] += 1;
    tally.visits += match.turns.length;
    tally.dartsThrown += matchDarts;
    modes.set(match.mode, tally);

    if (result === "won") matchesWon += 1;
    if (isCompetitive(result)) competitiveMatches += 1;
    // A winnerless non-drill may be an abandoned match filed through the public
    // record boundary. It remains an unscored session, but it is not practice.
    if (isDrillMode(match.mode)) practiceSessions += 1;
    visits += match.turns.length;
    dartsThrown += matchDarts;
  }

  const ordered = chronological(matches);
  const recentForm = ordered.flatMap((match): RecentFormEntry[] => {
    const result = effectiveResult(match);
    return isCompetitive(result) ? [{ completedAt: match.completedAt, mode: match.mode, result }] : [];
  }).slice(-RECENT_WINDOW);
  return {
    matchesPlayed: matches.length,
    competitiveMatches,
    practiceSessions,
    matchesWon,
    winPercentage: competitiveMatches === 0 ? 0 : (matchesWon * 100) / competitiveMatches,
    visits,
    dartsThrown,
    x01: x01Stats(ordered.filter((match) => match.mode === "x01")),
    modes: [...modes.entries()]
      .map(([mode, tally]) => {
        const competitive = tally.won + tally.lost;
        return {
          mode,
          ...tally,
          winPercentage: competitive === 0 ? null : (tally.won * 100) / competitive,
        };
      })
      .sort((left, right) => right.played - left.played || left.mode.localeCompare(right.mode)),
    recentForm,
    drills: drillProgress(ordered),
  };
}

function x01Stats(matches: readonly StatMatch[]): X01Stats {
  let points = 0;
  let darts = 0;
  let openingPoints = 0;
  let openingDarts = 0;
  let checkoutAttempts = 0;
  let checkoutsHit = 0;
  let bestVisit = 0;
  let busts = 0;
  let bestLegDarts: number | null = null;
  let unattributedCheckouts = 0;
  const finishingBeds = new Map<number, number>();

  for (const match of matches) {
    const band = finishBand(match.outRule ?? "double");
    // Legs are grouped per match: leg 1 of one match is not leg 1 of another.
    const legs = new Map<number, StatTurn[]>();
    for (const turn of match.turns) {
      points += scored(turn);
      darts += turn.dartsThrown;
      if (turn.bust) busts += 1;
      bestVisit = Math.max(bestVisit, scored(turn));
      if (turn.scoreBefore >= band.min && turn.scoreBefore <= band.max) {
        checkoutAttempts += 1;
        if (!turn.bust && turn.scoreAfter === 0) {
          checkoutsHit += 1;
          const exact = exactDarts(turn);
          const finishingDart = exact?.at(-1);
          if (isLegalDouble(finishingDart)) {
            finishingBeds.set(finishingDart.segment, (finishingBeds.get(finishingDart.segment) ?? 0) + 1);
          } else {
            unattributedCheckouts += 1;
          }
        }
      }
      legs.set(turn.legNumber, [...(legs.get(turn.legNumber) ?? []), turn]);
    }

    for (const legTurns of legs.values()) {
      for (const turn of legTurns.slice(0, 3)) {
        openingPoints += scored(turn);
        openingDarts += turn.dartsThrown;
      }
      // A leg this player won is one their own visit took to zero without busting.
      if (!legTurns.some((turn) => !turn.bust && turn.scoreAfter === 0)) continue;
      const legDarts = legTurns.reduce((total, turn) => total + turn.dartsThrown, 0);
      bestLegDarts = bestLegDarts === null ? legDarts : Math.min(bestLegDarts, legDarts);
    }
  }

  const attributable = [...finishingBeds.values()].reduce((total, hits) => total + hits, 0);
  const trend = matches
    .filter((match): match is StatMatch & { readonly result: "won" | "lost" } => isCompetitive(match.result))
    .slice(-RECENT_WINDOW)
    .map((match) => {
      const perMatch = x01Summary(match);
      return {
        completedAt: match.completedAt,
        threeDartAverage: perMatch.threeDartAverage,
        checkoutPercentage: perMatch.checkoutPercentage,
        result: match.result,
      };
    });

  return {
    matches: matches.length,
    threeDartAverage: darts === 0 ? 0 : (points * 3) / darts,
    firstNineAverage: openingDarts === 0 ? 0 : (openingPoints * 3) / openingDarts,
    checkoutAttempts,
    checkoutsHit,
    checkoutPercentage: checkoutAttempts === 0 ? 0 : (checkoutsHit * 100) / checkoutAttempts,
    bestVisit,
    bestLegDarts,
    busts,
    finishingBeds: [...finishingBeds.entries()]
      .map(([segment, hits]) => ({ segment, hits, share: (hits * 100) / attributable }))
      .sort((left, right) => right.hits - left.hits || left.segment - right.segment),
    unattributedCheckouts,
    trend,
  };
}

/** Per-match X01 metrics use the same definitions as the career aggregate. */
function x01Summary(match: StatMatch): {
  readonly threeDartAverage: number;
  readonly checkoutPercentage: number;
} {
  const band = finishBand(match.outRule ?? "double");
  let points = 0;
  let darts = 0;
  let attempts = 0;
  let hits = 0;
  for (const turn of match.turns) {
    points += scored(turn);
    darts += turn.dartsThrown;
    if (turn.scoreBefore < band.min || turn.scoreBefore > band.max) continue;
    attempts += 1;
    if (!turn.bust && turn.scoreAfter === 0) hits += 1;
  }
  return {
    threeDartAverage: darts === 0 ? 0 : (points * 3) / darts,
    checkoutPercentage: attempts === 0 ? 0 : (hits * 100) / attempts,
  };
}

function drillProgress(matches: readonly StatMatch[]): readonly DrillProgress[] {
  return DRILL_ORDER.map((mode) => {
    const recent = matches
      .filter((match) => match.mode === mode)
      .slice(-RECENT_WINDOW)
      .map((match) => ({ completedAt: match.completedAt, value: drillSessionValue(match) }));
    const values = recent.map(({ value }) => value);
    const sessions = matches.filter((match) => match.mode === mode).length;
    // A plan's full history can be larger than the display window, so aggregates
    // use every visible session even though `recent` deliberately stays bounded.
    const allValues = matches
      .filter((match) => match.mode === mode)
      .map(drillSessionValue);
    return {
      mode,
      unit: DRILLS[mode].unit,
      sessions,
      latest: values.at(-1) ?? null,
      best: allValues.length === 0 ? null : Math.max(...allValues),
      average: allValues.length === 0
        ? null
        : allValues.reduce((total, value) => total + value, 0) / allValues.length,
      recent,
    };
  });
}

/** Drill adapters store the running total in each visit's scoreAfter. */
function drillSessionValue(match: StatMatch): number {
  return match.turns.at(-1)?.scoreAfter ?? 0;
}
