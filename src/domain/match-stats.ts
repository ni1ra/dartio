import type { OutRule } from "./x01";

/**
 * A player's career, computed from what was stored rather than from a live match.
 *
 * `x01PlayerStats` answers "how am I doing in this match" from an in-memory state.
 * This answers "how do I play" from rows that outlived the match, so it takes the
 * stored visit shape and nothing else. The two use the same definitions on purpose
 * — a checkout attempt is arriving on a finishable score, not happening to win —
 * and `match-stats.test.ts` asserts they agree on the same match rather than
 * trusting that they still do.
 */

/** One stored visit, as the player who threw it. */
export interface StatTurn {
  readonly legNumber: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
  readonly dartsThrown: number;
}

export interface StatMatch {
  readonly id: string;
  readonly mode: string;
  /** X01 only; the rule decides which scores were finishable. Null for every other mode. */
  readonly outRule: OutRule | null;
  readonly won: boolean;
  /** Only the visits this player threw. */
  readonly turns: readonly StatTurn[];
}

export interface ModeTally {
  readonly mode: string;
  readonly played: number;
  readonly won: number;
}

export interface X01Stats {
  readonly matches: number;
  readonly threeDartAverage: number;
  /** Average over the first three visits of each leg, taken before checkout distorts it. */
  readonly firstNineAverage: number;
  readonly checkoutAttempts: number;
  readonly checkoutsHit: number;
  /** Percentage, 0–100. Zero attempts reads as 0 rather than as undefined. */
  readonly checkoutPercentage: number;
  readonly bestVisit: number;
  /** Fewest darts taken to win a leg, or null if no leg has been won. */
  readonly bestLegDarts: number | null;
  readonly busts: number;
}

export interface CareerStats {
  readonly matchesPlayed: number;
  readonly matchesWon: number;
  readonly winPercentage: number;
  readonly visits: number;
  readonly dartsThrown: number;
  readonly x01: X01Stats;
  readonly modes: readonly ModeTally[];
}

/** A visit scores nothing when it busts, because a bust restores the score it started from. */
function scored(turn: StatTurn): number {
  return turn.bust ? 0 : turn.scoreBefore - turn.scoreAfter;
}

/** The band the out rule can finish from in three darts. */
function finishBand(outRule: OutRule): { readonly min: number; readonly max: number } {
  return { min: outRule === "straight" ? 1 : 2, max: outRule === "double" ? 170 : 180 };
}

export function careerStats(matches: readonly StatMatch[]): CareerStats {
  const modes = new Map<string, { played: number; won: number }>();
  let visits = 0;
  let dartsThrown = 0;
  let matchesWon = 0;

  for (const match of matches) {
    const tally = modes.get(match.mode) ?? { played: 0, won: 0 };
    tally.played += 1;
    if (match.won) {
      tally.won += 1;
      matchesWon += 1;
    }
    modes.set(match.mode, tally);
    visits += match.turns.length;
    dartsThrown += match.turns.reduce((total, turn) => total + turn.dartsThrown, 0);
  }

  return {
    matchesPlayed: matches.length,
    matchesWon,
    winPercentage: matches.length === 0 ? 0 : (matchesWon * 100) / matches.length,
    visits,
    dartsThrown,
    x01: x01Stats(matches.filter((match) => match.mode === "x01")),
    modes: [...modes.entries()]
      .map(([mode, tally]) => ({ mode, played: tally.played, won: tally.won }))
      .sort((left, right) => right.played - left.played || left.mode.localeCompare(right.mode)),
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
        if (!turn.bust && turn.scoreAfter === 0) checkoutsHit += 1;
      }
      legs.set(turn.legNumber, [...(legs.get(turn.legNumber) ?? []), turn]);
    }

    for (const turns of legs.values()) {
      for (const turn of turns.slice(0, 3)) {
        openingPoints += scored(turn);
        openingDarts += turn.dartsThrown;
      }
      // A leg this player won is one their own visit took to zero without busting.
      if (!turns.some((turn) => !turn.bust && turn.scoreAfter === 0)) continue;
      const legDarts = turns.reduce((total, turn) => total + turn.dartsThrown, 0);
      bestLegDarts = bestLegDarts === null ? legDarts : Math.min(bestLegDarts, legDarts);
    }
  }

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
  };
}
