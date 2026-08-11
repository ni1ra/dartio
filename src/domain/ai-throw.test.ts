import { describe, expect, it } from "vitest";
import { scoreBoardPoint } from "./darts";
import { aiSpread, seededRandom, throwAiDart, type Aim } from "./ai-throw";

describe("mode-neutral AI execution", () => {
  it("samples a positioned dart whose score is derived from its coordinates", () => {
    const result = throwAiDart(14, { segment: 19, multiplier: 3 }, seededRandom(5519));
    expect(result).toMatchObject({
      aim: { segment: 19, multiplier: 3 },
      radialError: expect.any(Number),
      dart: { x: expect.any(Number), y: expect.any(Number) },
    });
    expect(scoreBoardPoint({ x: result.dart.x!, y: result.dart.y! })).toEqual(result.dart);
  });

  it("replays identically from an isolated seed", () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    expect(Array.from({ length: 12 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, first)))
      .toEqual(Array.from({ length: 12 }, () => throwAiDart(8, { segment: 20, multiplier: 3 }, second)));
  });

  it("makes every successive level strictly more accurate", () => {
    for (let level = 2; level <= 20; level += 1) {
      expect(aiSpread(level)).toBeLessThan(aiSpread(level - 1));
    }
  });

  it.each([
    { segment: 0, multiplier: 1 },
    { segment: 21, multiplier: 1 },
    { segment: 25, multiplier: 3 },
    { segment: 20, multiplier: 4 },
  ])("rejects invalid target $segment × $multiplier at the domain boundary", (target) => {
    expect(() => throwAiDart(9, target as Aim, () => 1))
      .toThrow("AI target must be a legal non-miss scoring bed");
  });

  it.each([0, 8.5, 21])("rejects invalid level %s", (level) => {
    expect(() => throwAiDart(level, { segment: 20, multiplier: 3 }, () => 1))
      .toThrow("AI level must be an integer from 1 to 20");
  });
});
