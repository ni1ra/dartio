import { describe, expect, it } from "vitest";
import { projectDartMarker } from "./dart-marker";

describe("projectDartMarker", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 0.4, y: -0.7 },
    { x: 1.02, y: 0 },
  ])("leaves origin and visible points unchanged", (point) => {
    expect(projectDartMarker(point)).toMatchObject({ ...point, capped: false });
  });

  it("marks a near-rim miss without moving it", () => {
    expect(projectDartMarker({ x: 1.03, y: 0 })).toEqual({
      x: 1.03,
      y: 0,
      offBoard: true,
      capped: false,
    });
  });

  it("caps a distant miss at the visible rim while preserving direction", () => {
    const source = { x: 3, y: 4 };
    const projected = projectDartMarker(source);
    expect(Math.hypot(projected.x, projected.y)).toBeCloseTo(1.06, 10);
    expect(projected.x * source.y - projected.y * source.x).toBeCloseTo(0, 10);
    expect(projected).toMatchObject({ offBoard: true, capped: true });
  });

  it("fails visually safe for non-finite local coordinates", () => {
    expect(projectDartMarker({ x: Number.POSITIVE_INFINITY, y: 1 })).toEqual({
      x: 0,
      y: 0,
      offBoard: true,
      capped: true,
    });
  });
});
