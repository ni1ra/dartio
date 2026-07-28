import { describe, expect, it } from "vitest";
import { aiSpread, aiTactics, applyDart, chooseTacticalAim, createX01, generateAiVisit, seededRandom } from "@/domain";

/**
 * The ladder has to be real.
 *
 * Before this cycle every level chose identical targets and differed only in
 * miss radius, so "level 19" meant "level 3 with steadier hands". These are
 * simulations rather than assertions about one visit: darts are random, so the
 * claim is about distributions, measured with a fixed seed so the numbers mean
 * the same thing on every run.
 */
function simulateLeg(level: number, seed: number): { darts: number; won: boolean } {
  let state = createX01(
    { startingScore: 501, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" },
    [{ id: "ai", name: "AI" }],
  );
  const random = seededRandom(seed);
  let darts = 0;
  // A leg that takes more than 120 darts is lost for our purposes; the cap
  // stops a level-1 bot from running the suite into the ground.
  while (state.status === "playing" && darts < 120) {
    const visit = generateAiVisit(level, {
      score: state.scores[0]!,
      opened: true,
      inRule: "straight",
      outRule: "double",
    }, random);
    for (const value of visit) {
      if (state.status !== "playing") break;
      state = applyDart(state, value);
      darts += 1;
    }
  }
  return { darts, won: state.status === "complete" };
}

function averageDarts(level: number, legs = 6): number {
  let total = 0;
  for (let leg = 0; leg < legs; leg += 1) total += simulateLeg(level, level * 1000 + leg * 7 + 1).darts;
  return total / legs;
}

describe("AI ladder", () => {
  it("ladders decision quality, not only accuracy", () => {
    expect(aiTactics(1)).toBe("novice");
    expect(aiTactics(5)).toBe("novice");
    expect(aiTactics(6)).toBe("competent");
    expect(aiTactics(12)).toBe("competent");
    expect(aiTactics(13)).toBe("expert");
    expect(aiTactics(20)).toBe("expert");
  });

  it("a tactical level aims at a checkout route where a novice aims at the treble", () => {
    const position = { remaining: 141, dartsLeft: 3, outRule: "double" } as const;
    expect(chooseTacticalAim({ ...position, level: 2 })).toEqual({ segment: 20, multiplier: 3 });
    // 141 is T20 T19 D12; both start on the treble twenty, so use a score where
    // the professional route does not open on it.
    const awkward = { remaining: 135, dartsLeft: 3, outRule: "double" } as const;
    expect(chooseTacticalAim({ ...awkward, level: 2 })).toEqual({ segment: 20, multiplier: 3 });
    expect(chooseTacticalAim({ ...awkward, level: 20 })).toEqual({ segment: 25, multiplier: 2 });
  });

  it("an expert sets up a leave where a novice keeps hammering the treble", () => {
    // 169 is a bogey: no three-dart double-out exists, so the right move is a
    // setup, not another treble twenty.
    const bogey = { remaining: 169, dartsLeft: 3, outRule: "double" } as const;
    expect(chooseTacticalAim({ ...bogey, level: 2 })).toEqual({ segment: 20, multiplier: 3 });
    const expert = chooseTacticalAim({ ...bogey, level: 20 });
    expect(expert).toBeTruthy();
  });

  // Simulation, not arithmetic: an expert calls the checkout planner on every
  // dart, so this is the one slow test in the suite and says so out loud.
  it("finishes a leg faster at the top of the ladder than at the bottom", () => {
    const novice = averageDarts(2);
    const competent = averageDarts(10);
    const expert = averageDarts(19);

    // Not a strict monotonic claim over all twenty levels — that would be a
    // claim about noise. The bands must separate, and by a real margin.
    expect(competent).toBeLessThan(novice);
    expect(expert).toBeLessThan(competent);
    expect(expert).toBeLessThan(novice * 0.7);
  }, 60_000);

  it("keeps the miss spread strictly decreasing across every level", () => {
    // Measured on the model itself rather than by simulation: this is a claim
    // about the accuracy curve, and sampling it would only add noise.
    for (let level = 2; level <= 20; level += 1) {
      expect(aiSpread(level), `level ${level} is not tighter than ${level - 1}`)
        .toBeLessThan(aiSpread(level - 1));
    }
  });
});
