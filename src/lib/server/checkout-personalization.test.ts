import { describe, expect, it } from "vitest";
import type { StatDart, StatMatch, StatTurn } from "@/domain/match-stats";
import {
  CHECKOUT_PERSONALIZATION_HISTORY_LIMIT,
  checkoutPersonalizationOff,
  checkoutPersonalizationUnavailable,
  deriveCheckoutPersonalization,
} from "./checkout-personalization";

const exact = (segment: number, multiplier: 1 | 2 | 3, ordinal: 1 | 2 | 3): StatDart => ({
  segment,
  multiplier,
  ordinal,
});

function turn(
  darts: readonly StatDart[],
  overrides: Partial<StatTurn> = {},
): StatTurn {
  const score = darts.reduce((total, thrown) => total + thrown.segment * thrown.multiplier, 0);
  return {
    legNumber: 1,
    scoreBefore: 501,
    scoreAfter: 501 - score,
    bust: false,
    dartsThrown: darts.length,
    darts,
    ...overrides,
  };
}

function match(id: string, turns: readonly StatTurn[], mode = "x01"): StatMatch {
  return {
    id,
    mode,
    completedAt: `2026-08-${String((Number(id) % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    result: "won",
    outRule: mode === "x01" ? "double" : null,
    turns,
  };
}

const scoringVisit = (treble = 20) => turn([
  exact(treble, 3, 1),
  exact(treble, 3, 2),
  exact(treble, 3, 3),
]);

const finishingVisit = (segment: number) => turn(
  [exact(segment, 2, 1)],
  { scoreBefore: segment * 2, scoreAfter: 0, dartsThrown: 1 },
);

describe("deriveCheckoutPersonalization", () => {
  it("returns an explicit zero-evidence receipt when consent is off", () => {
    expect(checkoutPersonalizationOff()).toEqual({
      status: "off", x01Matches: 0, exactDarts: 0, finishingDoubles: 0,
    });
    expect(checkoutPersonalizationUnavailable()).toEqual({
      status: "unavailable", x01Matches: 0, exactDarts: 0, finishingDoubles: 0,
    });
  });

  it("stays sparse for a small or one-off sample", () => {
    const result = deriveCheckoutPersonalization([
      match("1", [scoringVisit(), finishingVisit(16)]),
      match("2", [finishingVisit(16)]),
    ]);
    expect(result.preferences).toEqual({});
    expect(result.receipt).toEqual({
      status: "sparse", x01Matches: 2, exactDarts: 5, finishingDoubles: 2,
    });
  });

  it("ranks recurring finishing doubles and treble landings with stable ties", () => {
    const matches = Array.from({ length: 5 }, (_, index) => match(String(index + 1), [
      scoringVisit(index < 3 ? 20 : 19),
      scoringVisit(index < 3 ? 20 : 19),
      scoringVisit(index < 3 ? 20 : 19),
      finishingVisit(index < 3 ? 16 : 10),
    ]));
    const result = deriveCheckoutPersonalization(matches);
    expect(result.preferences).toEqual({ preferredDoubles: [16], preferredTrebles: [20, 19] });
    expect(result.receipt).toEqual({
      status: "applied", x01Matches: 5, exactDarts: 50, finishingDoubles: 5,
    });
  });

  it("never upgrades aggregate, partial, impossible, or contradictory visits", () => {
    const result = deriveCheckoutPersonalization([
      match("1", [
        turn([], { dartsThrown: 3, scoreBefore: 60, scoreAfter: 0 }),
        turn([exact(20, 3, 2)], { dartsThrown: 1 }),
        turn([exact(25, 3, 1)], { dartsThrown: 1 }),
        turn([exact(20, 3, 1)], { scoreBefore: 501, scoreAfter: 500, dartsThrown: 1 }),
      ]),
    ]);
    expect(result).toEqual({
      preferences: {},
      receipt: { status: "sparse", x01Matches: 1, exactDarts: 0, finishingDoubles: 0 },
    });
  });

  it("counts exact bust landings but never treats the bust as a finish", () => {
    const bust = turn([
      exact(20, 3, 1), exact(20, 3, 2), exact(20, 3, 3),
    ], { scoreBefore: 100, scoreAfter: 100, bust: true });
    const result = deriveCheckoutPersonalization(Array.from({ length: 5 }, (_, index) =>
      match(String(index + 1), [bust, bust, bust])));
    expect(result.preferences).toEqual({ preferredTrebles: [20] });
    expect(result.receipt).toEqual({
      status: "applied", x01Matches: 5, exactDarts: 45, finishingDoubles: 0,
    });
  });

  it("ignores other modes and caps the owned X01 history window", () => {
    const rows = [
      match("900", [finishingVisit(16)], "cricket"),
      ...Array.from({ length: CHECKOUT_PERSONALIZATION_HISTORY_LIMIT + 5 }, (_, index) =>
        match(String(index + 1), [scoringVisit()])),
    ];
    const result = deriveCheckoutPersonalization(rows);
    expect(result.receipt.x01Matches).toBe(CHECKOUT_PERSONALIZATION_HISTORY_LIMIT);
    expect(result.receipt.exactDarts).toBe(CHECKOUT_PERSONALIZATION_HISTORY_LIMIT * 3);
    expect(result.receipt.finishingDoubles).toBe(0);
  });
});
