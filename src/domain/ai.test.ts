import { describe, expect, it } from "vitest";
import { aiSpread, seededRandom, throwAiDart } from "@/domain";

describe("AI levels", () => {
  it("has strictly improving measured accuracy from 1 through 20", () => {
    const means = Array.from({ length: 20 }, (_, index) => {
      const rng = seededRandom(5519);
      const errors = Array.from({ length: 2000 }, () => throwAiDart(index + 1, { segment: 20, multiplier: 3 }, rng).radialError);
      return errors.reduce((a, b) => a + b, 0) / errors.length;
    });
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeLessThan(means[i - 1]!);
    expect(aiSpread(20)).toBeLessThan(aiSpread(1) / 4);
  });

  it("replays identically from a seed while producing misses", () => {
    const a = seededRandom(42); const b = seededRandom(42);
    const first = Array.from({ length: 20 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, a).dart.score);
    const second = Array.from({ length: 20 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, b).dart.score);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(2);
  });
});
