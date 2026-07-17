import { representativePoint, scoreBoardPoint, type BoardNumber, type Dart, type Multiplier } from "./darts";

export interface Aim { readonly segment: BoardNumber; readonly multiplier: Multiplier }
export interface AiThrow { readonly dart: Dart; readonly aim: Aim; readonly radialError: number }

/** Seeded xorshift32; returns an isolated generator with values in [0,1). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0 || 0x6d2b79f5;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

/** Standard deviation in normalized board radii; strictly decreases from level 1 to 20. */
export function aiSpread(level: number): number {
  validateLevel(level);
  return 0.235 * Math.exp(-0.105 * (level - 1)) + 0.012;
}

export function throwAiDart(level: number, aim: Aim, random: () => number): AiThrow {
  validateLevel(level);
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

export function chooseAiAim(remaining: number): Aim {
  if (remaining === 50) return { segment: 25, multiplier: 2 };
  if (remaining > 1 && remaining <= 40 && remaining % 2 === 0) return { segment: (remaining / 2) as BoardNumber, multiplier: 2 };
  return { segment: 20, multiplier: 3 };
}

function validateLevel(level: number) { if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error("AI level must be an integer from 1 to 20"); }
