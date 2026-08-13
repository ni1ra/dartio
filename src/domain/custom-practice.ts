import { dart, type BoardNumber, type Dart, type Multiplier } from "./darts";

/** A custom path stays short enough to understand, share, and finish at one oche. */
export const CUSTOM_PRACTICE_MAX_TARGETS = 12;

export interface PracticeTarget {
  readonly segment: BoardNumber;
  readonly multiplier: Multiplier;
}

export interface CustomPracticeAttempt {
  readonly index: number;
  readonly target: PracticeTarget;
  readonly darts: readonly Dart[];
  readonly hit: boolean;
}

export interface CustomPracticeState {
  readonly targets: readonly PracticeTarget[];
  readonly attempts: readonly CustomPracticeAttempt[];
  readonly currentDarts: readonly Dart[];
  readonly status: "playing" | "complete";
}

export interface CustomPracticeSummary {
  readonly attempts: number;
  readonly hits: number;
  readonly hitPercentage: number;
  readonly dartsThrown: number;
}

/** Returns a canonical, URL-safe identity for one exact target path. */
export function encodeCustomPracticePath(targets: readonly PracticeTarget[]): string {
  assertTargets(targets);
  return targets.map(practiceTargetNotation).join(".");
}

/** Refuses aliases and malformed paths so one path always has one resume key. */
export function parseCustomPracticePath(value: string): readonly PracticeTarget[] | null {
  const tokens = value.split(".");
  if (tokens.length < 1 || tokens.length > CUSTOM_PRACTICE_MAX_TARGETS) return null;
  const targets: PracticeTarget[] = [];
  for (const token of tokens) {
    if (token === "SB") { targets.push({ segment: 25, multiplier: 1 }); continue; }
    if (token === "DB") { targets.push({ segment: 25, multiplier: 2 }); continue; }
    const match = /^([SDT])([1-9]|1\d|20)$/.exec(token);
    if (!match) return null;
    targets.push({
      segment: Number(match[2]) as BoardNumber,
      multiplier: match[1] === "D" ? 2 : match[1] === "T" ? 3 : 1,
    });
  }
  return targets;
}

export function practiceTargetNotation(target: PracticeTarget): string {
  validateTarget(target);
  if (target.segment === 25) return target.multiplier === 2 ? "DB" : "SB";
  return `${target.multiplier === 3 ? "T" : target.multiplier === 2 ? "D" : "S"}${target.segment}`;
}

export function createCustomPractice(targets: readonly PracticeTarget[]): CustomPracticeState {
  assertTargets(targets);
  return Object.freeze({
    targets: targets.map((target) => Object.freeze({ ...target })),
    attempts: [],
    currentDarts: [],
    status: "playing",
  });
}

export function customPracticeTarget(state: CustomPracticeState): PracticeTarget | null {
  return state.status === "complete" ? null : state.targets[state.attempts.length] ?? null;
}

/** A target settles on the first exact bed, or after three misses. */
export function applyCustomPracticeDart(state: CustomPracticeState, value: Dart): CustomPracticeState {
  if (state.status === "complete") throw new Error("The custom practice path is already complete");
  // Reconstructing through `dart` keeps callers from smuggling an impossible bed.
  dart(value.segment, value.multiplier, value.x === undefined || value.y === undefined
    ? undefined
    : { x: value.x, y: value.y });
  const target = customPracticeTarget(state);
  if (!target) throw new Error("The custom practice target is missing");
  const darts = [...state.currentDarts, value];
  const hit = darts.some((thrown) => thrown.segment === target.segment && thrown.multiplier === target.multiplier);
  if (!hit && darts.length < 3) return Object.freeze({ ...state, currentDarts: darts });

  const attempts = [...state.attempts, {
    index: state.attempts.length,
    target,
    darts,
    hit,
  }];
  return Object.freeze({
    ...state,
    attempts,
    currentDarts: [],
    status: attempts.length === state.targets.length ? "complete" : "playing",
  });
}

export function customPracticeSummary(state: CustomPracticeState): CustomPracticeSummary {
  const hits = state.attempts.filter((attempt) => attempt.hit).length;
  return {
    attempts: state.attempts.length,
    hits,
    hitPercentage: state.attempts.length === 0 ? 0 : (hits * 100) / state.attempts.length,
    dartsThrown: state.attempts.reduce((total, attempt) => total + attempt.darts.length, 0)
      + state.currentDarts.length,
  };
}

function assertTargets(targets: readonly PracticeTarget[]): void {
  if (targets.length < 1 || targets.length > CUSTOM_PRACTICE_MAX_TARGETS) {
    throw new Error(`A custom practice path needs 1–${CUSTOM_PRACTICE_MAX_TARGETS} targets`);
  }
  targets.forEach(validateTarget);
}

function validateTarget(target: PracticeTarget): void {
  if (!Number.isInteger(target.segment) || target.segment < 1 || target.segment > 25
    || (target.segment > 20 && target.segment !== 25)) {
    throw new Error("A custom practice target must be a board number or bull");
  }
  if (![1, 2, 3].includes(target.multiplier) || (target.segment === 25 && target.multiplier === 3)) {
    throw new Error("A custom practice target must be a physical scoring bed");
  }
}
