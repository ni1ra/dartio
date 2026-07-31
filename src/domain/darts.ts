export const BOARD_CLOCKWISE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

export type BoardNumber = (typeof BOARD_CLOCKWISE)[number] | 25;
export type Multiplier = 1 | 2 | 3;

/**
 * Regulation steel-tip scoring-bed dimensions in millimetres.
 * Source: WDF-sanctioned manufacturer specification:
 * https://www.reddragondarts.com/pages/dartboard-specifications
 * Bull values are radii derived from the published 12.7 mm and 31.8 mm diameters.
 */
export const REGULATION_BOARD_MM = Object.freeze({
  innerBullRadius: 6.35,
  outerBullRadius: 15.9,
  trebleOuterRadius: 107,
  trebleRingWidth: 8,
  doubleOuterRadius: 170,
  doubleRingWidth: 8,
});

const NORMALIZING_RADIUS_MM = REGULATION_BOARD_MM.doubleOuterRadius;
export const BOARD_RADII = Object.freeze({
  innerBull: REGULATION_BOARD_MM.innerBullRadius / NORMALIZING_RADIUS_MM,
  outerBull: REGULATION_BOARD_MM.outerBullRadius / NORMALIZING_RADIUS_MM,
  trebleInner: (REGULATION_BOARD_MM.trebleOuterRadius - REGULATION_BOARD_MM.trebleRingWidth) / NORMALIZING_RADIUS_MM,
  trebleOuter: REGULATION_BOARD_MM.trebleOuterRadius / NORMALIZING_RADIUS_MM,
  doubleInner: (REGULATION_BOARD_MM.doubleOuterRadius - REGULATION_BOARD_MM.doubleRingWidth) / NORMALIZING_RADIUS_MM,
  outer: REGULATION_BOARD_MM.doubleOuterRadius / NORMALIZING_RADIUS_MM,
});

export interface Dart {
  readonly segment: BoardNumber | 0;
  readonly multiplier: Multiplier;
  readonly score: number;
  readonly x?: number;
  readonly y?: number;
}

export interface BoardPoint { readonly x: number; readonly y: number }

export function dart(segment: BoardNumber | 0, multiplier: Multiplier = 1, point?: BoardPoint): Dart {
  if (![0, 25, ...BOARD_CLOCKWISE].includes(segment)) throw new Error("Segment must be 0, 1–20, or 25");
  if (segment === 0 && multiplier !== 1) throw new Error("A miss cannot have a multiplier");
  if (segment === 25 && multiplier === 3) throw new Error("The bull has no treble ring");
  return Object.freeze({ segment, multiplier, score: segment * multiplier, ...point });
}

/** Scores a point on a normalized board: center=(0,0), outer double wire radius=1. */
export function scoreBoardPoint({ x, y }: BoardPoint): Dart {
  const radius = Math.hypot(x, y);
  const wireTolerance = Number.EPSILON * 8;
  if (radius > BOARD_RADII.outer + wireTolerance) return dart(0, 1, { x, y });
  if (radius <= BOARD_RADII.innerBull + wireTolerance) return dart(25, 2, { x, y });
  if (radius <= BOARD_RADII.outerBull + wireTolerance) return dart(25, 1, { x, y });

  const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  const index = Math.floor((angle + 9) / 18) % 20;
  const segment = BOARD_CLOCKWISE[index] as BoardNumber;
  const multiplier: Multiplier = radius >= BOARD_RADII.doubleInner - wireTolerance ? 2 : radius >= BOARD_RADII.trebleInner - wireTolerance && radius <= BOARD_RADII.trebleOuter + wireTolerance ? 3 : 1;
  return dart(segment, multiplier, { x, y });
}

export function representativePoint(value: Pick<Dart, "segment" | "multiplier">): BoardPoint {
  if (value.segment === 0) return { x: 0, y: -(BOARD_RADII.outer + 0.05) };
  if (value.segment === 25) return { x: 0, y: value.multiplier === 2 ? 0 : (BOARD_RADII.innerBull + BOARD_RADII.outerBull) / 2 };
  const index = BOARD_CLOCKWISE.indexOf(value.segment as (typeof BOARD_CLOCKWISE)[number]);
  const angle = index * Math.PI / 10;
  const radius = value.multiplier === 3 ? (BOARD_RADII.trebleInner + BOARD_RADII.trebleOuter) / 2 : value.multiplier === 2 ? (BOARD_RADII.doubleInner + BOARD_RADII.outer) / 2 : 0.72;
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

export function notation(value: Dart): string {
  if (value.segment === 0) return "MISS";
  if (value.segment === 25) return value.multiplier === 2 ? "DB" : "SB";
  return `${value.multiplier === 3 ? "T" : value.multiplier === 2 ? "D" : "S"}${value.segment}`;
}

/**
 * The dart an event describes.
 *
 * Every mode's log stores the same thing — a bed, a multiplier, and where it
 * physically landed if it was thrown at a board — and every one of them had its own
 * copy of this conversion. Four copies of three lines is three chances for them to
 * disagree about what an absent landing point means. It lives here because `darts`
 * is what they all already share; no mode learns anything about another by using it.
 */
export function dartFromEvent(event: { readonly segment: BoardNumber | 0; readonly multiplier: Multiplier; readonly x?: number; readonly y?: number }): Dart {
  return event.x === undefined || event.y === undefined
    ? dart(event.segment, event.multiplier)
    : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
}
