import {
  BOARD_CLOCKWISE,
  representativePoint,
  scoreBoardPoint,
  type BoardNumber,
  type Dart,
  type Multiplier,
} from "./darts";

export interface Aim {
  readonly segment: BoardNumber;
  readonly multiplier: Multiplier;
}

export interface AiThrow {
  readonly dart: Dart;
  readonly aim: Aim;
  readonly radialError: number;
}

/** Seeded xorshift32; returns an isolated generator with values in [0,1). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Standard deviation in normalized board radii; strictly decreases from level 1 to 20. */
export function aiSpread(level: number): number {
  validateLevel(level);
  return 0.235 * Math.exp(-0.105 * (level - 1)) + 0.012;
}

/**
 * Samples one physical landing around a caller-selected scoring bed.
 *
 * This module deliberately knows only the board and execution quality. Match
 * rules choose the target elsewhere, which lets the premium authority improve
 * every mode without learning any mode's rules or checkout policy.
 */
export function throwAiDart(level: number, aim: Aim, random: () => number): AiThrow {
  validateLevel(level);
  validateAim(aim);
  const center = representativePoint(aim);
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  const gaussian = Math.sqrt(-2 * Math.log(u1));
  const spread = aiSpread(level);
  const dx = gaussian * Math.cos(2 * Math.PI * u2) * spread;
  const dy = gaussian * Math.sin(2 * Math.PI * u2) * spread;
  const point = { x: center.x + dx, y: center.y + dy };
  return { aim, dart: scoreBoardPoint(point), radialError: Math.hypot(dx, dy) };
}

function validateAim(aim: Aim): void {
  const segmentIsLegal = aim.segment === 25
    || BOARD_CLOCKWISE.includes(aim.segment as (typeof BOARD_CLOCKWISE)[number]);
  const multiplierIsLegal = aim.multiplier === 1
    || aim.multiplier === 2
    || aim.multiplier === 3;
  if (!segmentIsLegal || !multiplierIsLegal || (aim.segment === 25 && aim.multiplier === 3)) {
    throw new RangeError("AI target must be a legal non-miss scoring bed");
  }
}

function validateLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError("AI level must be an integer from 1 to 20");
  }
}
