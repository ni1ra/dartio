import type { BoardNumber, CheckoutPreferences } from "@/domain";
import type { StatDart, StatMatch, StatTurn } from "@/domain/match-stats";
import type { CheckoutPersonalizationReceipt } from "@/lib/product/checkout-personalization";

/** The API never scans an account's unbounded lifetime to advise one visit. */
export const CHECKOUT_PERSONALIZATION_HISTORY_LIMIT = 50;

const MIN_EXACT_DARTS_FOR_TREBLES = 45;
const MIN_TREBLE_HITS = 9;
const MIN_BED_OBSERVATIONS = 3;
const MAX_PREFERRED_BEDS = 3;

export interface CheckoutPersonalizationProfile {
  readonly preferences: CheckoutPreferences;
  readonly receipt: CheckoutPersonalizationReceipt;
}

/** Explicit opt-out also proves that no history query was needed. */
export function checkoutPersonalizationOff(): CheckoutPersonalizationReceipt {
  return { status: "off", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 };
}

/** A failed optional read never removes the otherwise authorized Pro advice. */
export function checkoutPersonalizationUnavailable(): CheckoutPersonalizationReceipt {
  return { status: "unavailable", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 };
}

/**
 * Derives route-ranking hints from observed landings, never from invented aims.
 *
 * The reader already scopes rows to the signed-in seat. This second boundary is
 * deliberately conservative: partial/aggregate visits and internally
 * contradictory exact visits contribute no preference evidence. A bed also has
 * to recur, so one lucky dart cannot be presented as player-specific precision.
 */
export function deriveCheckoutPersonalization(
  matches: readonly StatMatch[],
): CheckoutPersonalizationProfile {
  const x01 = matches
    .filter((match) => match.mode === "x01")
    .slice(0, CHECKOUT_PERSONALIZATION_HISTORY_LIMIT);
  const finishingDoubles = new Map<number, number>();
  const trebleHits = new Map<number, number>();
  let exactDarts = 0;
  let finishingDoubleCount = 0;
  let trebleHitCount = 0;

  for (const match of x01) {
    for (const turn of match.turns) {
      const exact = exactVisit(turn);
      if (!exact) continue;
      exactDarts += exact.length;

      for (const thrown of exact) {
        if (thrown.multiplier !== 3 || thrown.segment < 1 || thrown.segment > 20) continue;
        trebleHitCount += 1;
        trebleHits.set(thrown.segment, (trebleHits.get(thrown.segment) ?? 0) + 1);
      }

      const finish = exact.at(-1);
      if (turn.bust || turn.scoreAfter !== 0 || !isLegalDouble(finish)) continue;
      finishingDoubleCount += 1;
      finishingDoubles.set(finish.segment, (finishingDoubles.get(finish.segment) ?? 0) + 1);
    }
  }

  const preferredDoubles = recurringBeds(finishingDoubles);
  const preferredTrebles = exactDarts >= MIN_EXACT_DARTS_FOR_TREBLES && trebleHitCount >= MIN_TREBLE_HITS
    ? recurringBeds(trebleHits)
    : [];
  const applied = preferredDoubles.length > 0 || preferredTrebles.length > 0;

  return {
    preferences: {
      ...(preferredDoubles.length > 0 ? { preferredDoubles } : {}),
      ...(preferredTrebles.length > 0 ? { preferredTrebles } : {}),
    },
    receipt: {
      status: applied ? "applied" : "sparse",
      x01Matches: x01.length,
      exactDarts,
      finishingDoubles: finishingDoubleCount,
    },
  };
}

/** Exact means darts 1..N once, legal physical beds, and a truthful score delta. */
function exactVisit(turn: StatTurn): readonly StatDart[] | null {
  if (!Number.isInteger(turn.dartsThrown) || turn.dartsThrown < 1 || turn.dartsThrown > 3) return null;
  if (turn.darts.length !== turn.dartsThrown) return null;
  const ordered = [...turn.darts].sort((left, right) => left.ordinal - right.ordinal);
  if (!ordered.every((thrown, index) => thrown.ordinal === index + 1 && isPhysicalDart(thrown))) return null;
  if (!turn.bust && ordered.reduce((total, thrown) => total + dartScore(thrown), 0) !== turn.scoreBefore - turn.scoreAfter) {
    return null;
  }
  return ordered;
}

function isPhysicalDart(thrown: StatDart): boolean {
  if (![1, 2, 3].includes(thrown.multiplier)) return false;
  if (thrown.segment === 0) return thrown.multiplier === 1;
  if (thrown.segment === 25) return thrown.multiplier !== 3;
  return Number.isInteger(thrown.segment) && thrown.segment >= 1 && thrown.segment <= 20;
}

function isLegalDouble(thrown: StatDart | undefined): thrown is StatDart {
  return thrown !== undefined
    && thrown.multiplier === 2
    && (thrown.segment === 25 || (thrown.segment >= 1 && thrown.segment <= 20));
}

function dartScore(thrown: StatDart): number {
  return thrown.segment * thrown.multiplier;
}

function recurringBeds(counts: ReadonlyMap<number, number>): BoardNumber[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_BED_OBSERVATIONS)
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, MAX_PREFERRED_BEDS)
    // Counts are populated only after the physical-board guards above.
    .map(([segment]) => segment as BoardNumber);
}
