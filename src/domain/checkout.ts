import { dart, notation, type Dart } from "./darts";
import type { OutRule } from "./x01";

export type CheckoutReasonCode =
  | "professional-route"
  | "ranked-checkout"
  | "preferred-double"
  | "preferred-treble"
  | "bull-finish"
  | "bogey-number"
  | "next-visit-finish"
  | "scoring-setup"
  | "invalid-score"
  | "no-route";

export interface CheckoutPreferences {
  readonly preferredDoubles?: readonly Dart["segment"][];
  readonly preferredTrebles?: readonly Dart["segment"][];
  readonly avoidBull?: boolean;
}

export interface CheckoutRoutePlan {
  readonly darts: readonly Dart[];
  readonly leave: 0;
  readonly reasonCodes: readonly CheckoutReasonCode[];
  readonly explanation: string;
}

export interface CheckoutSetupPlan {
  readonly darts: readonly Dart[];
  readonly leave: number;
  readonly reasonCodes: readonly CheckoutReasonCode[];
  readonly explanation: string;
}

export interface CheckoutAdvice {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly checkout: boolean;
  readonly bogey: boolean;
  readonly primary: readonly Dart[] | null;
  readonly alternates: readonly (readonly Dart[])[];
  readonly setup: readonly Dart[] | null;
  readonly leave: number | null;
  readonly targetLeave: number | null;
  readonly reasonCodes: readonly CheckoutReasonCode[];
  readonly explanation: string;
  readonly primaryPlan: CheckoutRoutePlan | null;
  readonly alternatePlans: readonly CheckoutRoutePlan[];
  readonly setupPlan: CheckoutSetupPlan | null;
}

const STANDARD_ROUTES: Readonly<Record<number, readonly string[]>> = {
  170: ["T20", "T20", "DB"], 167: ["T20", "T19", "DB"], 164: ["T20", "T18", "DB"],
  161: ["T20", "T17", "DB"], 160: ["T20", "T20", "D20"], 158: ["T20", "T20", "D19"],
  157: ["T20", "T19", "D20"], 156: ["T20", "T20", "D18"], 155: ["T20", "T19", "D19"],
  154: ["T20", "T18", "D20"], 153: ["T20", "T19", "D18"], 152: ["T20", "T20", "D16"],
  151: ["T20", "T17", "D20"], 150: ["T20", "T18", "D18"], 149: ["T20", "T19", "D16"],
  148: ["T20", "T16", "D20"], 147: ["T20", "T17", "D18"], 146: ["T20", "T18", "D16"],
  145: ["T20", "T15", "D20"], 144: ["T20", "T20", "D12"], 143: ["T20", "T17", "D16"],
  142: ["T20", "T14", "D20"], 141: ["T20", "T19", "D12"], 140: ["T20", "T20", "D10"],
  138: ["T20", "T18", "D12"], 137: ["T20", "T19", "D10"], 136: ["T20", "T20", "D8"],
  135: ["DB", "T15", "D20"], 134: ["T20", "T14", "D16"], 133: ["T20", "T19", "D8"],
  132: ["DB", "T14", "D20"], 131: ["T20", "T13", "D16"], 130: ["T20", "T18", "D8"],
  129: ["T19", "T16", "D12"], 128: ["T18", "T14", "D16"], 127: ["T20", "T17", "D8"],
  126: ["T19", "T19", "D6"], 125: ["SB", "T20", "D20"], 124: ["T20", "T16", "D8"],
  123: ["T19", "T16", "D9"], 122: ["T18", "T18", "D7"], 121: ["T20", "T11", "D14"],
  120: ["T20", "S20", "D20"], 119: ["T19", "T12", "D13"], 118: ["T20", "S18", "D20"],
  117: ["T20", "S17", "D20"], 116: ["T20", "S16", "D20"], 115: ["T20", "S15", "D20"],
  114: ["T20", "S14", "D20"], 113: ["T20", "S13", "D20"], 112: ["T20", "S12", "D20"],
  111: ["T20", "S11", "D20"], 110: ["T20", "DB"], 109: ["T20", "S9", "D20"],
  108: ["T20", "S16", "D16"], 107: ["T19", "DB"], 106: ["T20", "S14", "D16"],
  105: ["T19", "S16", "D16"], 104: ["T18", "DB"], 103: ["T19", "S6", "D20"],
  102: ["T20", "S10", "D16"], 101: ["T17", "DB"], 100: ["T20", "D20"],
  99: ["T19", "S10", "D16"], 98: ["T20", "D19"], 97: ["T19", "D20"],
  96: ["T20", "D18"], 95: ["T19", "D19"], 94: ["T18", "D20"],
  93: ["T19", "D18"], 92: ["T20", "D16"], 91: ["T17", "D20"],
  90: ["T20", "D15"], 89: ["T19", "D16"], 88: ["T20", "D14"],
  87: ["T17", "D18"], 86: ["T18", "D16"], 85: ["T15", "D20"],
  84: ["T20", "D12"], 83: ["T17", "D16"], 82: ["DB", "D16"],
  81: ["T19", "D12"], 80: ["T20", "D10"], 79: ["T19", "D11"],
  78: ["T18", "D12"], 77: ["T19", "D10"], 76: ["T20", "D8"],
  75: ["T17", "D12"], 74: ["T14", "D16"], 73: ["T19", "D8"],
  72: ["T16", "D12"], 71: ["T13", "D16"], 70: ["T18", "D8"],
  69: ["S19", "DB"], 68: ["T20", "D4"], 67: ["T17", "D8"],
  66: ["T10", "D18"], 65: ["SB", "D20"], 64: ["T16", "D8"],
  63: ["T13", "D12"], 62: ["T10", "D16"], 61: ["T15", "D8"],
  60: ["S20", "D20"], 58: ["S18", "D20"], 56: ["S16", "D20"],
  54: ["S14", "D20"], 52: ["S12", "D20"], 50: ["DB"], 48: ["S16", "D16"],
  40: ["D20"], 36: ["D18"], 32: ["D16"], 24: ["D12"], 16: ["D8"], 8: ["D4"],
};

const TARGETS: readonly Dart[] = [
  ...rangeDown(20).map((segment) => dart(segment, 3)),
  dart(25, 2),
  ...rangeDown(20).map((segment) => dart(segment, 2)),
  ...rangeDown(20).map((segment) => dart(segment, 1)),
  dart(25, 1),
];

const DOUBLE_ORDER = [20, 16, 18, 12, 10, 8, 14, 6, 4, 2, 1, 19, 17, 15, 13, 11, 9, 7, 5, 3, 25] as const;
const TREBLE_ORDER = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;
const BOGEY_NUMBERS = new Set([169, 168, 166, 165, 163, 162, 159]);
const FINISH_EXISTS = new Map<string, boolean>();

export function checkoutAdvice(
  score: number,
  dartsAvailable: 1 | 2 | 3 = 3,
  outRule: OutRule = "double",
  preferences: CheckoutPreferences = {},
): CheckoutAdvice {
  validateDartsAvailable(dartsAvailable);
  validateOutRule(outRule);
  if (!Number.isInteger(score) || score < minimumScore(outRule)) {
    return emptyAdvice(score, dartsAvailable, "invalid-score", "The remaining score cannot be finished under this out rule.");
  }

  const routes = findFinishRoutes(score, dartsAvailable, outRule, preferences);
  if (routes.length > 0) {
    const plans = routes.slice(0, 5).map((route) => finishPlan(route, score, dartsAvailable, outRule, preferences));
    const [primaryPlan, ...alternatePlans] = plans as [CheckoutRoutePlan, ...CheckoutRoutePlan[]];
    return {
      score,
      dartsAvailable,
      checkout: true,
      bogey: false,
      primary: primaryPlan.darts,
      alternates: alternatePlans.map((plan) => plan.darts),
      setup: null,
      leave: 0,
      targetLeave: 0,
      reasonCodes: primaryPlan.reasonCodes,
      explanation: primaryPlan.explanation,
      primaryPlan,
      alternatePlans,
      setupPlan: null,
    };
  }

  const bogey = outRule === "double" && dartsAvailable === 3 && BOGEY_NUMBERS.has(score);
  const setupPlan = findSetupPlan(score, dartsAvailable, outRule, preferences);
  const reasonCodes: CheckoutReasonCode[] = [
    ...(bogey ? ["bogey-number" as const] : []),
    ...(setupPlan?.reasonCodes ?? ["no-route" as const]),
  ];
  const explanation = bogey
    ? `No three-dart double-out exists from ${score}. ${setupPlan?.explanation ?? "No safe setup is available."}`
    : setupPlan?.explanation ?? `No valid ${dartsAvailable}-dart route is available from ${score}.`;
  return {
    score,
    dartsAvailable,
    checkout: false,
    bogey,
    primary: null,
    alternates: [],
    setup: setupPlan?.darts ?? null,
    leave: setupPlan?.leave ?? null,
    targetLeave: setupPlan?.leave ?? null,
    reasonCodes,
    explanation,
    primaryPlan: null,
    alternatePlans: [],
    setupPlan,
  };
}

/**
 * Free-plan checkout advice: the single highest-ranked route to a finish.
 *
 * The paid `advanced_checkout` entitlement covers alternate routes, setup-visit
 * planning, and preference-driven ranking. Those are produced only by the
 * server route that verifies the entitlement, so this function must never
 * compute them — a client that can render them is a client that was granted
 * them without authorization. Skipping `findSetupPlan` also keeps the free path
 * off the exhaustive three-dart setup walk, which is the expensive half.
 */
export function basicCheckoutAdvice(
  score: number,
  dartsAvailable: 1 | 2 | 3 = 3,
  outRule: OutRule = "double",
): CheckoutAdvice {
  validateDartsAvailable(dartsAvailable);
  validateOutRule(outRule);
  if (!Number.isInteger(score) || score < minimumScore(outRule)) {
    return emptyAdvice(score, dartsAvailable, "invalid-score", "The remaining score cannot be finished under this out rule.");
  }

  const [route] = findFinishRoutes(score, dartsAvailable, outRule, {});
  if (route) {
    const primaryPlan = finishPlan(route, score, dartsAvailable, outRule, {});
    return {
      score,
      dartsAvailable,
      checkout: true,
      bogey: false,
      primary: primaryPlan.darts,
      alternates: [],
      setup: null,
      leave: 0,
      targetLeave: 0,
      reasonCodes: primaryPlan.reasonCodes,
      explanation: primaryPlan.explanation,
      primaryPlan,
      alternatePlans: [],
      setupPlan: null,
    };
  }

  const bogey = outRule === "double" && dartsAvailable === 3 && BOGEY_NUMBERS.has(score);
  return {
    score,
    dartsAvailable,
    checkout: false,
    bogey,
    primary: null,
    alternates: [],
    setup: null,
    leave: null,
    targetLeave: null,
    reasonCodes: bogey ? ["bogey-number"] : ["no-route"],
    explanation: bogey
      ? `No three-dart double-out exists from ${score}. Score down to a finishable leave.`
      : `No valid ${dartsAvailable}-dart route is available from ${score}.`,
    primaryPlan: null,
    alternatePlans: [],
    setupPlan: null,
  };
}

function findFinishRoutes(score: number, dartsAvailable: number, outRule: OutRule, preferences: CheckoutPreferences): Dart[][] {
  if (score > maximumFinish(dartsAvailable, outRule)) return [];
  const routes: Dart[][] = [];
  const walk = (left: number, remaining: number, route: Dart[]) => {
    for (const target of TARGETS) {
      if (target.score > left) continue;
      if (target.score === left) {
        if (qualifiesOut(target, outRule)) routes.push([...route, target]);
        continue;
      }
      if (remaining > 1) walk(left - target.score, remaining - 1, [...route, target]);
    }
  };
  walk(score, dartsAvailable, []);
  return routes.sort((a, b) => compareVectors(routeRank(a, score, dartsAvailable, outRule, preferences), routeRank(b, score, dartsAvailable, outRule, preferences)) || signature(a).localeCompare(signature(b)));
}

function routeRank(route: readonly Dart[], score: number, dartsAvailable: number, outRule: OutRule, preferences: CheckoutPreferences): readonly number[] {
  const standard = STANDARD_ROUTES[score]?.join(" ");
  const final = route.at(-1)!;
  const explicitPreference = preferencePenalty(route, preferences);
  const fallback = firstTargetFallback(route, score, dartsAvailable, outRule) ? 0 : 1;
  const nonScoringBeds = route.slice(0, -1).reduce((total, target) => total + (target.multiplier === 3 ? 0 : target.multiplier === 1 ? 1 : 3), 0);
  return [
    explicitPreference,
    route.length,
    standard === signature(route) ? 0 : 1,
    fallback,
    finishTargetRank(final, outRule),
    nonScoringBeds,
    openingTargetRank(route[0]!),
    segmentSwitches(route),
  ];
}

function preferencePenalty(route: readonly Dart[], preferences: CheckoutPreferences): number {
  let penalty = preferences.avoidBull && route.some((target) => target.segment === 25) ? 100 : 0;
  const final = route.at(-1)!;
  const doubles = validPreferenceSegments(preferences.preferredDoubles, true);
  if (doubles.length > 0) penalty += final.multiplier === 2 ? preferenceIndex(final.segment, doubles) : doubles.length + 10;
  const trebles = validPreferenceSegments(preferences.preferredTrebles, false);
  if (trebles.length > 0) {
    const firstTreble = route.find((target) => target.multiplier === 3);
    penalty += firstTreble ? preferenceIndex(firstTreble.segment, trebles) : trebles.length + 10;
  }
  return penalty;
}

function firstTargetFallback(route: readonly Dart[], score: number, dartsAvailable: number, outRule: OutRule): boolean {
  const first = route[0]!;
  if (dartsAvailable === 1 || first.multiplier === 1) return true;
  const fallback = dart(first.segment, 1);
  return canFinish(score - fallback.score, dartsAvailable - 1, outRule);
}

function canFinish(score: number, dartsAvailable: number, outRule: OutRule): boolean {
  if (score < minimumScore(outRule) || dartsAvailable < 1 || score > maximumFinish(dartsAvailable, outRule)) return false;
  const key = `${outRule}:${dartsAvailable}:${score}`;
  const cached = FINISH_EXISTS.get(key);
  if (cached !== undefined) return cached;
  for (const target of TARGETS) {
    if (target.score === score && qualifiesOut(target, outRule)) { FINISH_EXISTS.set(key, true); return true; }
    if (target.score < score && dartsAvailable > 1 && canFinish(score - target.score, dartsAvailable - 1, outRule)) { FINISH_EXISTS.set(key, true); return true; }
  }
  FINISH_EXISTS.set(key, false);
  return false;
}

function findSetupPlan(score: number, dartsAvailable: number, outRule: OutRule, preferences: CheckoutPreferences): CheckoutSetupPlan | null {
  let best: { route: Dart[]; leave: number; rank: readonly number[]; hasNextFinish: boolean } | null = null;
  const walk = (left: number, remaining: number, route: Dart[]) => {
    for (const target of TARGETS) {
      const leave = left - target.score;
      if (leave < minimumScore(outRule)) continue;
      if (remaining === 1) {
        const candidate = [...route, target];
        const hasNextFinish = canFinish(leave, 3, outRule);
        const rank = setupRank(candidate, leave, hasNextFinish, outRule, preferences);
        if (!best || compareVectors(rank, best.rank) < 0 || (compareVectors(rank, best.rank) === 0 && signature(candidate).localeCompare(signature(best.route)) < 0)) best = { route: candidate, leave, rank, hasNextFinish };
      } else {
        walk(leave, remaining - 1, [...route, target]);
      }
    }
  };
  walk(score, dartsAvailable, []);
  if (!best) return null;
  const winner = best as { route: Dart[]; leave: number; hasNextFinish: boolean };
  const nextRoute = winner.hasNextFinish ? findFinishRoutes(winner.leave, 3, outRule, preferences)[0] ?? null : null;
  const preferredDouble = preferredDoubleLeave(winner.leave, preferences);
  const reasonCodes: CheckoutReasonCode[] = [nextRoute ? "next-visit-finish" : "scoring-setup", ...(preferredDouble ? ["preferred-double" as const] : [])];
  const explanation = nextRoute
    ? `Uses all ${winner.route.length} available dart${winner.route.length === 1 ? "" : "s"} to leave ${winner.leave}, with ${signature(nextRoute)} available next visit.`
    : `Best scoring setup uses all ${winner.route.length} available dart${winner.route.length === 1 ? "" : "s"} and leaves ${winner.leave}.`;
  return { darts: winner.route, leave: winner.leave, reasonCodes, explanation };
}

function setupRank(route: readonly Dart[], leave: number, hasNextFinish: boolean, outRule: OutRule, preferences: CheckoutPreferences): readonly number[] {
  const scored = route.reduce((total, target) => total + target.score, 0);
  const setupRisk = route.reduce((total, target) => total + setupTargetRisk(target), 0);
  return [
    hasNextFinish ? 0 : 1,
    hasNextFinish ? leaveQuality(leave, outRule, preferences) : 0,
    hasNextFinish ? setupRisk : -scored,
    hasNextFinish ? -scored : setupRisk,
    openingTargetRank(route[0]!),
    segmentSwitches(route),
  ];
}

function setupTargetRisk(target: Dart): number {
  if (target.multiplier === 3) return target.segment >= 15 ? 0 : target.segment >= 10 ? 2 : 4;
  if (target.multiplier === 1) return 1;
  return target.segment === 25 ? 5 : 3;
}

function leaveQuality(leave: number, outRule: OutRule, preferences: CheckoutPreferences): number {
  const preferred = validPreferenceSegments(preferences.preferredDoubles, true);
  const preferredIndexValue = preferred.findIndex((segment) => leave === segment * 2);
  if (preferredIndexValue >= 0) return preferredIndexValue;
  const defaultIndex = DOUBLE_ORDER.findIndex((segment) => leave === segment * 2);
  if (defaultIndex >= 0) return preferred.length + defaultIndex;
  const minimumDarts = canFinish(leave, 1, outRule) ? 1 : canFinish(leave, 2, outRule) ? 2 : 3;
  return preferred.length + DOUBLE_ORDER.length + minimumDarts * 100 + (STANDARD_ROUTES[leave] ? 0 : 10) + leave;
}

function finishPlan(route: readonly Dart[], score: number, dartsAvailable: number, outRule: OutRule, preferences: CheckoutPreferences): CheckoutRoutePlan {
  const standard = STANDARD_ROUTES[score]?.join(" ") === signature(route);
  const final = route.at(-1)!;
  const reasonCodes: CheckoutReasonCode[] = [standard ? "professional-route" : "ranked-checkout"];
  const preferredDoubles = validPreferenceSegments(preferences.preferredDoubles, true);
  const preferredTrebles = validPreferenceSegments(preferences.preferredTrebles, false);
  if (final.multiplier === 2 && preferredDoubles.includes(final.segment)) reasonCodes.push("preferred-double");
  if (route.some((target) => target.multiplier === 3 && preferredTrebles.includes(target.segment))) reasonCodes.push("preferred-treble");
  if (final.segment === 25) reasonCodes.push("bull-finish");
  const fallback = firstTargetFallback(route, score, dartsAvailable, outRule) ? " with a recoverable single-bed miss" : "";
  return {
    darts: route,
    leave: 0,
    reasonCodes,
    explanation: `${standard ? "Professional first-choice" : "Highest-ranked valid"} ${route.length}-dart route to ${notation(final)}${fallback}.`,
  };
}

function finishTargetRank(target: Dart, outRule: OutRule): number {
  if (target.multiplier === 2) {
    const index = DOUBLE_ORDER.indexOf(target.segment as (typeof DOUBLE_ORDER)[number]);
    return index < 0 ? 100 : index;
  }
  if (outRule === "master" && target.multiplier === 3) {
    const index = TREBLE_ORDER.indexOf(target.segment as (typeof TREBLE_ORDER)[number]);
    return 30 + (index < 0 ? 100 : index);
  }
  return 60 + openingTargetRank(target);
}

function openingTargetRank(target: Dart): number {
  if (target.multiplier === 3) return TREBLE_ORDER.indexOf(target.segment as (typeof TREBLE_ORDER)[number]);
  if (target.segment === 25) return target.multiplier === 2 ? 25 : 26;
  if (target.multiplier === 2) return 30 + DOUBLE_ORDER.indexOf(target.segment as (typeof DOUBLE_ORDER)[number]);
  return 60 + (20 - target.segment);
}

function maximumFinish(dartsAvailable: number, outRule: OutRule): number {
  return (dartsAvailable - 1) * 60 + (outRule === "double" ? 50 : 60);
}

function minimumScore(outRule: OutRule): number { return outRule === "straight" ? 1 : 2; }
function qualifiesOut(target: Dart, outRule: OutRule): boolean { return outRule === "straight" || target.multiplier === 2 || (outRule === "master" && target.multiplier === 3); }
function signature(route: readonly Dart[]): string { return route.map(notation).join(" "); }
function segmentSwitches(route: readonly Dart[]): number { return route.slice(1).reduce((total, target, index) => total + (target.segment === route[index]!.segment ? 0 : 1), 0); }
function compareVectors(a: readonly number[], b: readonly number[]): number { for (let index = 0; index < Math.max(a.length, b.length); index += 1) { const difference = (a[index] ?? 0) - (b[index] ?? 0); if (difference) return difference; } return 0; }
function rangeDown(max: number): Dart["segment"][] { return Array.from({ length: max }, (_, index) => (max - index) as Dart["segment"]); }
function validPreferenceSegments(values: readonly Dart["segment"][] | undefined, allowBull: boolean): Dart["segment"][] { return [...new Set((values ?? []).filter((segment) => Number.isInteger(segment) && segment >= 1 && segment <= (allowBull ? 25 : 20)))]; }
function preferenceIndex(segment: Dart["segment"], values: readonly Dart["segment"][]): number { const index = values.indexOf(segment); return index < 0 ? values.length + 10 : index; }
function preferredDoubleLeave(leave: number, preferences: CheckoutPreferences): boolean { return validPreferenceSegments(preferences.preferredDoubles, true).some((segment) => leave === segment * 2); }

function validateDartsAvailable(value: number): asserts value is 1 | 2 | 3 { if (!Number.isInteger(value) || value < 1 || value > 3) throw new RangeError("Darts available must be 1, 2, or 3"); }
function validateOutRule(value: string): asserts value is OutRule { if (value !== "straight" && value !== "double" && value !== "master") throw new RangeError("Out rule must be straight, double, or master"); }

function emptyAdvice(score: number, dartsAvailable: 1 | 2 | 3, reason: CheckoutReasonCode, explanation: string): CheckoutAdvice {
  return { score, dartsAvailable, checkout: false, bogey: false, primary: null, alternates: [], setup: null, leave: null, targetLeave: null, reasonCodes: [reason], explanation, primaryPlan: null, alternatePlans: [], setupPlan: null };
}
