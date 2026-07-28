import { describe, expect, it } from "vitest";
import { basicCheckoutAdvice, checkoutAdvice, notation, type Dart, type OutRule } from "@/domain";

function routeText(route: readonly Dart[] | null | undefined): string | null { return route ? route.map(notation).join(" ") : null; }
function routeScore(route: readonly Dart[]): number { return route.reduce((sum, target) => sum + target.score, 0); }
function validOut(target: Dart, outRule: OutRule): boolean { return outRule === "straight" || target.multiplier === 2 || (outRule === "master" && target.multiplier === 3); }
function expectValidFinish(route: readonly Dart[], score: number, dartsAvailable: number, outRule: OutRule) {
  expect(route.length).toBeGreaterThan(0);
  expect(route.length).toBeLessThanOrEqual(dartsAvailable);
  expect(routeScore(route)).toBe(score);
  expect(validOut(route.at(-1)!, outRule)).toBe(true);
}

describe("professional checkout ranking", () => {
  it.each([
    [170, "T20 T20 DB"],
    [167, "T20 T19 DB"],
    [164, "T20 T18 DB"],
    [161, "T20 T17 DB"],
    [135, "DB T15 D20"],
    [132, "DB T14 D20"],
    [129, "T19 T16 D12"],
    [121, "T20 T11 D14"],
    [108, "T20 S16 D16"],
    [104, "T18 DB"],
    [99, "T19 S10 D16"],
    [82, "DB D16"],
    [32, "D16"],
  ] as const)("ranks the conventional route for %i", (score, expected) => {
    const advice = checkoutAdvice(score);
    expect(routeText(advice.primary)).toBe(expected);
    expect(advice.reasonCodes).toContain("professional-route");
    expectValidFinish(advice.primary!, score, 3, "double");
  });

  it("respects one, two, and three darts available", () => {
    expect(checkoutAdvice(100, 1).checkout).toBe(false);
    expect(routeText(checkoutAdvice(100, 2).primary)).toBe("T20 D20");
    expect(routeText(checkoutAdvice(100, 3).primary)).toBe("T20 D20");
    expect(routeText(checkoutAdvice(40, 1).primary)).toBe("D20");
  });

  it("returns valid, unique alternates rather than duplicate permutations", () => {
    for (const score of [80, 99, 121, 132]) {
      const advice = checkoutAdvice(score);
      const routes = [advice.primary!, ...advice.alternates];
      const signatures = routes.map(routeText);
      expect(new Set(signatures).size).toBe(signatures.length);
      expect(advice.alternates.length).toBeGreaterThan(0);
      expect(advice.alternates.length).toBeLessThanOrEqual(4);
      for (const route of routes) expectValidFinish(route, score, 3, "double");
      expect(advice.alternatePlans.map((plan) => plan.darts)).toEqual(advice.alternates);
    }
  });

  it("is deterministic across repeated planning", () => {
    const signatures = Array.from({ length: 5 }, () => {
      const advice = checkoutAdvice(132);
      return [routeText(advice.primary), ...advice.alternates.map(routeText)];
    });
    expect(signatures.every((value) => JSON.stringify(value) === JSON.stringify(signatures[0]))).toBe(true);
  });
});

describe("bogeys and professional setup planning", () => {
  it.each([169, 168, 166, 165, 163, 162, 159])("identifies %i as a three-dart double-out bogey", (score) => {
    const advice = checkoutAdvice(score);
    expect(advice.checkout).toBe(false);
    expect(advice.bogey).toBe(true);
    expect(advice.reasonCodes).toContain("bogey-number");
    expect(advice.setup).toHaveLength(3);
    expect(routeScore(advice.setup!) + advice.leave!).toBe(score);
  });

  it.each([158, 160, 161, 164, 167, 170, 171])("does not falsely label %i as a bogey", (score) => {
    expect(checkoutAdvice(score).bogey).toBe(false);
  });

  it("uses the full visit to turn 169 into a safe tops leave", () => {
    const advice = checkoutAdvice(169);
    expect(routeText(advice.setup)).toBe("T20 T20 S9");
    expect(advice.leave).toBe(40);
    expect(advice.targetLeave).toBe(40);
    expect(advice.setupPlan?.reasonCodes).toContain("next-visit-finish");
    expect(advice.setupPlan?.explanation).toContain("D20");
  });

  it("scores maximally to leave the highest finish from 350", () => {
    const advice = checkoutAdvice(350);
    expect(routeText(advice.setup)).toBe("T20 T20 T20");
    expect(advice.leave).toBe(170);
    expect(advice.setupPlan?.explanation).toContain("T20 T20 DB");
  });

  it("provides a one-dart setup instead of an impossible one-dart double-out", () => {
    const advice = checkoutAdvice(60, 1, "double");
    expect(advice.checkout).toBe(false);
    expect(routeText(advice.setup)).toBe("S20");
    expect(advice.leave).toBe(40);
  });

  it("uses every dart for a high-score visit and explains a scoring setup", () => {
    const advice = checkoutAdvice(501);
    expect(routeText(advice.setup)).toBe("T20 T20 T20");
    expect(advice.leave).toBe(321);
    expect(advice.reasonCodes).toContain("scoring-setup");
  });
});

describe("dynamic per-dart replanning", () => {
  it("replans 121 after each intended hit", () => {
    expect(routeText(checkoutAdvice(121, 3).primary)).toBe("T20 T11 D14");
    expect(routeText(checkoutAdvice(61, 2).primary)).toBe("T15 D8");
    expect(routeText(checkoutAdvice(16, 1).primary)).toBe("D8");
  });

  it("offers a valid recovery after hitting single 20 instead of treble 20", () => {
    const recovery = checkoutAdvice(101, 2);
    expect(routeText(recovery.primary)).toBe("T17 DB");
    expectValidFinish(recovery.primary!, 101, 2, "double");
  });

  it("does not leak a three-dart route when only two remain", () => {
    const advice = checkoutAdvice(121, 2);
    expect(advice.checkout).toBe(false);
    expect(advice.primary).toBeNull();
    expect(advice.setup).toHaveLength(2);
  });
});

describe("out-rule correctness", () => {
  it("offers S1 only for straight-out", () => {
    expect(routeText(checkoutAdvice(1, 1, "straight").primary)).toBe("S1");
    expect(checkoutAdvice(1, 1, "double")).toMatchObject({ checkout: false, reasonCodes: ["invalid-score"] });
    expect(checkoutAdvice(1, 1, "master")).toMatchObject({ checkout: false, reasonCodes: ["invalid-score"] });
  });

  it("allows a treble to finish master-out but not double-out", () => {
    const master = checkoutAdvice(60, 1, "master");
    expect(routeText(master.primary)).toBe("T20");
    expectValidFinish(master.primary!, 60, 1, "master");
    expect(checkoutAdvice(60, 1, "double").checkout).toBe(false);
  });

  it("allows any scoring bed to finish straight-out", () => {
    const advice = checkoutAdvice(60, 1, "straight");
    expect(routeText(advice.primary)).toBe("T20");
    expectValidFinish(advice.primary!, 60, 1, "straight");
  });

  it("validates every alternate under master and straight rules", () => {
    for (const outRule of ["master", "straight"] as const) {
      const advice = checkoutAdvice(100, 2, outRule);
      expect(advice.checkout).toBe(true);
      for (const route of [advice.primary!, ...advice.alternates]) expectValidFinish(route, 100, 2, outRule);
    }
  });
});

describe("optional player preferences", () => {
  it("can prefer D16 without changing the default professional route", () => {
    expect(routeText(checkoutAdvice(80, 2).primary)).toBe("T20 D10");
    const personalized = checkoutAdvice(80, 2, "double", { preferredDoubles: [16] });
    expect(routeText(personalized.primary)).toBe("T16 D16");
    expect(personalized.reasonCodes).toContain("preferred-double");
  });

  it("can avoid a bull route when a valid non-bull route exists", () => {
    expect(routeText(checkoutAdvice(82, 2).primary)).toBe("DB D16");
    const personalized = checkoutAdvice(82, 2, "double", { avoidBull: true });
    expect(routeText(personalized.primary)).toBe("T14 D20");
    expect(personalized.primary?.some((target) => target.segment === 25)).toBe(false);
  });

  it("still uses bull when no bull-free checkout exists", () => {
    const advice = checkoutAdvice(170, 3, "double", { avoidBull: true });
    expect(routeText(advice.primary)).toBe("T20 T20 DB");
    expect(advice.reasonCodes).toContain("bull-finish");
  });
});

describe("invalid and impossible input", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("returns explicit invalid advice for %s", (score) => {
    const advice = checkoutAdvice(score);
    expect(advice).toMatchObject({ checkout: false, primary: null, setup: null, leave: null, reasonCodes: ["invalid-score"] });
  });

  it("rejects an invalid runtime darts count", () => {
    expect(() => checkoutAdvice(40, 0 as 1)).toThrow("Darts available must be 1, 2, or 3");
    expect(() => checkoutAdvice(40, 4 as 3)).toThrow("Darts available must be 1, 2, or 3");
  });

  it("rejects an invalid runtime out rule", () => {
    expect(() => checkoutAdvice(40, 1, "triple" as OutRule)).toThrow("Out rule must be straight, double, or master");
  });

  it("never fabricates an impossible double-out above the visit maximum", () => {
    const advice = checkoutAdvice(171, 3, "double");
    expect(advice.checkout).toBe(false);
    expect(advice.primary).toBeNull();
    expect(advice.bogey).toBe(false);
    expect(routeScore(advice.setup!) + advice.leave!).toBe(171);
  });
});

describe("free-tier basic checkout advice", () => {
  it("matches the paid primary route on every double-out finish", () => {
    for (let score = 2; score <= 170; score += 1) {
      const paid = checkoutAdvice(score, 3, "double");
      const free = basicCheckoutAdvice(score, 3, "double");
      expect(routeText(free.primary)).toBe(routeText(paid.primary));
      expect(free.checkout).toBe(paid.checkout);
      expect(free.bogey).toBe(paid.bogey);
    }
  });

  it("withholds the paid planning surfaces entirely", () => {
    const free = basicCheckoutAdvice(141, 3, "double");
    expect(free.checkout).toBe(true);
    expect(free.alternates).toEqual([]);
    expect(free.alternatePlans).toEqual([]);
    expect(free.setup).toBeNull();
    expect(free.setupPlan).toBeNull();
  });

  it("withholds the setup plan on a non-finishable score", () => {
    const paid = checkoutAdvice(200, 3, "double");
    const free = basicCheckoutAdvice(200, 3, "double");
    expect(paid.setupPlan).not.toBeNull();
    expect(free.setupPlan).toBeNull();
    expect(free.primary).toBeNull();
    expect(free.reasonCodes).toEqual(["scoring-setup"]);
  });

  it("still names a bogey number so the player is not misled", () => {
    const free = basicCheckoutAdvice(169, 3, "double");
    expect(free.bogey).toBe(true);
    expect(free.reasonCodes).toEqual(["bogey-number"]);
    expect(free.explanation).toContain("No three-dart double-out exists from 169");
  });

  it("calls the top of a leg a scoring phase, not a missing route", () => {
    const free = basicCheckoutAdvice(501, 3, "double");
    expect(free.reasonCodes).toEqual(["scoring-setup"]);
    expect(free.explanation).toContain("Scoring phase");
    expect(free.explanation).not.toContain("No valid");
    // Inside the finishing range with genuinely no route, it still says so:
    // 3 is reachable in one dart but no double equals it.
    expect(basicCheckoutAdvice(3, 1, "double").reasonCodes).toEqual(["no-route"]);
    // And a bogey stays a bogey rather than being softened into scoring copy.
    expect(basicCheckoutAdvice(159, 3, "double").reasonCodes).toEqual(["bogey-number"]);
  });

  it("ignores preferences because it accepts none", () => {
    expect(routeText(basicCheckoutAdvice(40, 3, "double").primary)).toBe("D20");
    expect(routeText(checkoutAdvice(40, 3, "double", { preferredDoubles: [10] }).primary)).toBe("S20 D10");
  });

  it("applies the same validation as the paid planner", () => {
    expect(() => basicCheckoutAdvice(40, 4 as 3)).toThrow("Darts available must be 1, 2, or 3");
    expect(() => basicCheckoutAdvice(40, 1, "triple" as OutRule)).toThrow("Out rule must be straight, double, or master");
    expect(basicCheckoutAdvice(1, 3, "double").reasonCodes).toEqual(["invalid-score"]);
  });
});
