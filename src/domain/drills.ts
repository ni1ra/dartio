import type { Dart } from "./darts";

/**
 * The three practice drills: Checkout Lab, Doubles Matrix, and Scoring Sprint.
 *
 * They are not games. Nobody wins one — they are attempt ledgers, a fixed list of
 * things to aim at, each attempt worth up to three darts, each either taken or not.
 * That shape is the same for all three, so what differs is one `DrillRules` entry:
 * what you aim at, what counts as taking it, and what the attempt is worth.
 *
 * Nothing here imports X01, Cricket, or the round modes. Like them, state is
 * immutable and the reducer is pure, so the same log, rewind, and resume machinery
 * applies without any of them knowing about the others.
 */
export type DrillId = "checkoutLab" | "doublesMatrix" | "scoringSprint";

export interface DrillAttempt {
  /** 0-based position in the drill's fixed list. */
  readonly index: number;
  /** The score to check out, the number to double, or null when anything counts. */
  readonly target: number | null;
  readonly darts: readonly Dart[];
  readonly hit: boolean;
  readonly scored: number;
}

export interface DrillState {
  readonly drill: DrillId;
  readonly attempts: readonly DrillAttempt[];
  readonly currentDarts: readonly Dart[];
  readonly status: "playing" | "complete";
}

export interface DrillRules {
  readonly name: string;
  /** How many attempts the whole drill is. */
  readonly attempts: number;
  /** What the player is aiming at on this attempt. */
  target(index: number): number | null;
  /** Whether the darts thrown took the attempt. */
  hit(target: number | null, darts: readonly Dart[]): boolean;
  /** What the attempt was worth. */
  score(target: number | null, darts: readonly Dart[], hit: boolean): number;
  /**
   * Whether the attempt is over before three darts. A checkout that lands, or one
   * that overshoots, is finished — making the player throw two more darts at
   * nothing would be a worse drill and a dishonest scoreline.
   */
  settled?(target: number | null, darts: readonly Dart[]): boolean;
  /** What the running total counts, for the surface to label it. */
  readonly unit: string;
  readonly blurb: string;
}

/** Classic finishes, easiest first, so the drill opens winnable and ends demanding. */
const CHECKOUT_LADDER = [40, 32, 36, 24, 16, 50, 60, 61, 81, 96, 110, 121] as const;
const DOUBLES = [...Array.from({ length: 20 }, (_, index) => index + 1), 25] as const;
const SPRINT_VISITS = 10;

function total(darts: readonly Dart[]): number {
  return darts.reduce((sum, thrown) => sum + thrown.score, 0);
}

/** A finish must land exactly, and the dart that lands it must be a double. */
function finishes(target: number, darts: readonly Dart[]): boolean {
  const last = darts[darts.length - 1];
  return last !== undefined && total(darts) === target && last.multiplier === 2;
}

export const DRILLS: Readonly<Record<DrillId, DrillRules>> = {
  checkoutLab: {
    name: "Checkout Lab",
    attempts: CHECKOUT_LADDER.length,
    unit: "checkouts",
    blurb: "Twelve classic finishes, three darts each. Land it on the double or it does not count.",
    target: (index) => CHECKOUT_LADDER[index] ?? null,
    hit: (target, darts) => target !== null && finishes(target, darts),
    score: (_target, _darts, hit) => (hit ? 1 : 0),
    // Over the target, or on one, and the attempt is decided either way.
    settled: (target, darts) => target !== null && (finishes(target, darts) || total(darts) >= target),
  },
  doublesMatrix: {
    name: "Doubles Matrix",
    attempts: DOUBLES.length,
    unit: "doubles",
    blurb: "Every double from one to twenty, then the bull. Three darts at each.",
    target: (index) => DOUBLES[index] ?? null,
    hit: (target, darts) => darts.some((thrown) => thrown.segment === target && thrown.multiplier === 2),
    score: (_target, _darts, hit) => (hit ? 1 : 0),
    settled: (target, darts) => darts.some((thrown) => thrown.segment === target && thrown.multiplier === 2),
  },
  scoringSprint: {
    name: "Scoring Sprint",
    attempts: SPRINT_VISITS,
    unit: "points",
    blurb: "Ten visits, everything counts. A visit of sixty or more is a hit.",
    target: () => null,
    hit: (_target, darts) => total(darts) >= 60,
    score: (_target, darts) => total(darts),
  },
};

export function createDrill(drill: DrillId): DrillState {
  if (!(drill in DRILLS)) throw new Error(`Unknown drill: ${drill}`);
  return Object.freeze({ drill, attempts: [], currentDarts: [], status: "playing" });
}

/** The attempt the player is on, or null once the drill is finished. */
export function drillTarget(state: DrillState): number | null {
  if (state.status === "complete") return null;
  return DRILLS[state.drill].target(state.attempts.length);
}

export function applyDrillDart(state: DrillState, value: Dart): DrillState {
  if (state.status === "complete") throw new Error("The drill is already finished");
  const rules = DRILLS[state.drill];
  const target = rules.target(state.attempts.length);
  const darts = [...state.currentDarts, value];

  const settled = rules.settled?.(target, darts) ?? false;
  if (!settled && darts.length < 3) {
    return Object.freeze({ ...state, currentDarts: darts });
  }

  const hit = rules.hit(target, darts);
  const attempts = [...state.attempts, {
    index: state.attempts.length,
    target,
    darts,
    hit,
    scored: rules.score(target, darts, hit),
  }];
  return Object.freeze({
    ...state,
    attempts,
    currentDarts: [],
    status: attempts.length >= rules.attempts ? "complete" : "playing",
  });
}

export interface DrillSummary {
  readonly attempts: number;
  readonly hits: number;
  /** Percentage, 0–100. No attempts reads as 0 rather than as undefined. */
  readonly hitPercentage: number;
  readonly total: number;
  readonly dartsThrown: number;
  readonly unit: string;
}

export function drillSummary(state: DrillState): DrillSummary {
  const hits = state.attempts.filter((attempt) => attempt.hit).length;
  return {
    attempts: state.attempts.length,
    hits,
    hitPercentage: state.attempts.length === 0 ? 0 : (hits * 100) / state.attempts.length,
    total: state.attempts.reduce((sum, attempt) => sum + attempt.scored, 0),
    dartsThrown: state.attempts.reduce((sum, attempt) => sum + attempt.darts.length, 0) + state.currentDarts.length,
    unit: DRILLS[state.drill].unit,
  };
}
