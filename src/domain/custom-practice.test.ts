import { describe, expect, it } from "vitest";
import { dart } from "./darts";
import {
  applyCustomPracticeDart,
  createCustomPractice,
  customPracticeSummary,
  encodeCustomPracticePath,
  parseCustomPracticePath,
  practiceTargetNotation,
} from "./custom-practice";

describe("custom practice rules", () => {
  it("round-trips one canonical physical target path", () => {
    const targets = [
      { segment: 20, multiplier: 3 },
      { segment: 16, multiplier: 2 },
      { segment: 25, multiplier: 1 },
      { segment: 25, multiplier: 2 },
    ] as const;
    const encoded = encodeCustomPracticePath(targets);
    expect(encoded).toBe("T20.D16.SB.DB");
    expect(parseCustomPracticePath(encoded)).toEqual(targets);
    expect(targets.map(practiceTargetNotation)).toEqual(["T20", "D16", "SB", "DB"]);
  });

  it.each([
    "", "S0", "S21", "T25", "D00", "s20", "S20..D16",
    Array.from({ length: 13 }, () => "S20").join("."),
  ])("refuses malformed or oversized path %s", (value) => {
    expect(parseCustomPracticePath(value)).toBeNull();
  });

  it("settles an attempt on the first exact bed", () => {
    const initial = createCustomPractice([{ segment: 20, multiplier: 3 }]);
    const miss = applyCustomPracticeDart(initial, dart(20, 1));
    expect(miss.currentDarts).toHaveLength(1);
    const hit = applyCustomPracticeDart(miss, dart(20, 3));
    expect(hit).toMatchObject({ status: "complete", currentDarts: [] });
    expect(hit.attempts[0]).toMatchObject({ hit: true, darts: [{ score: 20 }, { score: 60 }] });
    expect(customPracticeSummary(hit)).toEqual({ attempts: 1, hits: 1, hitPercentage: 100, dartsThrown: 2 });
  });

  it("moves on after three misses and keeps the next target independent", () => {
    let state = createCustomPractice([
      { segment: 20, multiplier: 3 },
      { segment: 16, multiplier: 2 },
    ]);
    state = applyCustomPracticeDart(state, dart(1));
    state = applyCustomPracticeDart(state, dart(2));
    state = applyCustomPracticeDart(state, dart(3));
    expect(state).toMatchObject({ status: "playing", attempts: [{ hit: false }], currentDarts: [] });
    state = applyCustomPracticeDart(state, dart(16, 2));
    expect(customPracticeSummary(state)).toEqual({ attempts: 2, hits: 1, hitPercentage: 50, dartsThrown: 4 });
  });
});
