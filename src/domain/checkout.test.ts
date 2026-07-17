import { describe, expect, it } from "vitest";
import { checkoutAdvice, notation } from "@/domain";

describe("checkoutAdvice", () => {
  it.each([[170, "T20 T20 DB"], [167, "T20 T19 DB"], [121, "T20 T11 D14"], [32, "D16"]])("uses a professional primary route for %i", (score, expected) => {
    const advice = checkoutAdvice(score);
    expect(advice.primary?.map(notation).join(" ")).toBe(expected);
    expect(advice.primary?.reduce((sum, d) => sum + d.score, 0)).toBe(score);
    expect(advice.primary?.at(-1)?.multiplier).toBe(2);
  });

  it.each([169, 168, 166, 165, 163, 162, 159])("identifies %i as a three-dart bogey", (score) => {
    const advice = checkoutAdvice(score);
    expect(advice.checkout).toBe(false);
    expect(advice.bogey).toBe(true);
    expect(advice.setup).not.toBeNull();
  });

  it("respects darts available", () => {
    expect(checkoutAdvice(100, 1).checkout).toBe(false);
    expect(checkoutAdvice(100, 2).primary?.map(notation)).toEqual(["T20", "D20"]);
  });

  it("offers S1 only for straight-out", () => {
    expect(checkoutAdvice(1, 1, "straight").primary?.map(notation)).toEqual(["S1"]);
    expect(checkoutAdvice(1, 1, "double").checkout).toBe(false);
  });
});
