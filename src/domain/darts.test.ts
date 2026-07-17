import { describe, expect, it } from "vitest";
import { BOARD_CLOCKWISE, BOARD_RADII, REGULATION_BOARD_MM, dart, notation, representativePoint, scoreBoardPoint } from "@/domain";

describe("visual board scoring", () => {
  it.each([[[0, 0], "DB"], [[0, -103 / 170], "T20"], [[0, -166 / 170], "D20"], [[103 / 170, 0], "T6"], [[1.1, 0], "MISS"]])("maps normalized point %j to %s", ([x, y], expected) => {
    expect(notation(scoreBoardPoint({ x: x!, y: y! }))).toBe(expected);
  });
  it("derives every normalized radius from regulation millimetres", () => {
    expect(REGULATION_BOARD_MM).toEqual({ innerBullRadius: 6.35, outerBullRadius: 15.9, trebleOuterRadius: 107, trebleRingWidth: 8, doubleOuterRadius: 170, doubleRingWidth: 8 });
    expect(BOARD_RADII).toEqual({ innerBull: 6.35 / 170, outerBull: 15.9 / 170, trebleInner: 99 / 170, trebleOuter: 107 / 170, doubleInner: 162 / 170, outer: 1 });
  });
  it("round-trips every numbered segment at single, treble, and double centers", () => {
    for (const segment of BOARD_CLOCKWISE) for (const multiplier of [1, 2, 3] as const) {
      const value = dart(segment, multiplier);
      expect(notation(scoreBoardPoint(representativePoint(value)))).toBe(notation(value));
    }
  });
  it.each([[dart(25, 1), "SB"], [dart(25, 2), "DB"], [dart(0), "MISS"]])("round-trips representative %s", (value, expected) => expect(notation(scoreBoardPoint(representativePoint(value)))).toBe(expected));
  it("resolves every segment correctly on both sides of both angular wires", () => {
    const angularEpsilon = 0.000001;
    const point = (angle: number, radius = 0.72) => ({ x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius });
    BOARD_CLOCKWISE.forEach((segment, index) => {
      const center = index * Math.PI / 10;
      const leftWire = center - Math.PI / 20;
      const rightWire = center + Math.PI / 20;
      const previous = BOARD_CLOCKWISE[(index + BOARD_CLOCKWISE.length - 1) % BOARD_CLOCKWISE.length]!;
      const next = BOARD_CLOCKWISE[(index + 1) % BOARD_CLOCKWISE.length]!;
      expect(scoreBoardPoint(point(leftWire + angularEpsilon)).segment).toBe(segment);
      expect(scoreBoardPoint(point(rightWire - angularEpsilon)).segment).toBe(segment);
      expect(scoreBoardPoint(point(leftWire - angularEpsilon)).segment).toBe(previous);
      expect(scoreBoardPoint(point(rightWire + angularEpsilon)).segment).toBe(next);
    });
  });
  it("uses every bull, treble, double, and outer radial wire consistently", () => {
    const epsilon = 0.000001;
    const point = (angle: number, radius: number) => ({ x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius });
    expect(notation(scoreBoardPoint(point(0, BOARD_RADII.innerBull - epsilon)))).toBe("DB");
    expect(notation(scoreBoardPoint(point(0, BOARD_RADII.innerBull)))).toBe("DB");
    expect(notation(scoreBoardPoint(point(0, BOARD_RADII.innerBull + epsilon)))).toBe("SB");
    expect(notation(scoreBoardPoint(point(0, BOARD_RADII.outerBull)))).toBe("SB");
    expect(notation(scoreBoardPoint(point(0, BOARD_RADII.outerBull + epsilon)))).toBe("S20");
    BOARD_CLOCKWISE.forEach((segment, index) => {
      const angle = index * Math.PI / 10;
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.trebleInner - epsilon)))).toBe(`S${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.trebleInner)))).toBe(`T${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.trebleOuter)))).toBe(`T${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.trebleOuter + epsilon)))).toBe(`S${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.doubleInner - epsilon)))).toBe(`S${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.doubleInner)))).toBe(`D${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.outer)))).toBe(`D${segment}`);
      expect(notation(scoreBoardPoint(point(angle, BOARD_RADII.outer + epsilon)))).toBe("MISS");
    });
  });
  it.each([[21, 1], [22, 1], [23, 1], [24, 1], [0, 2], [25, 3]] as const)("rejects illegal segment/multiplier %i x%i", (segment, multiplier) => expect(() => dart(segment as never, multiplier)).toThrow());
});
