import { checkoutAdvice } from "./checkout";
import { representativePoint, scoreBoardPoint, type BoardNumber, type Dart, type Multiplier } from "./darts";
import type { InRule, OutRule } from "./x01";

export interface Aim { readonly segment: BoardNumber; readonly multiplier: Multiplier }
export interface AiThrow { readonly dart: Dart; readonly aim: Aim; readonly radialError: number }
export interface AiVisitContext {
  readonly score: number;
  readonly opened: boolean;
  readonly inRule: InRule;
  readonly outRule: OutRule;
}

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

/** Generates one complete visit without owning or trusting match state. */
export function generateAiVisit(
  level: number,
  context: AiVisitContext,
  random: () => number,
): readonly Dart[] {
  validateLevel(level);
  if (!Number.isInteger(context.score) || context.score < 1 || context.score > 9999) {
    throw new Error("AI visit score must be an integer from 1 to 9999");
  }
  if (context.score === 1 && (context.outRule !== "straight" || (!context.opened && context.inRule !== "straight"))) {
    throw new Error("AI visit score 1 requires an opened straight-out game");
  }

  const darts: Dart[] = [];
  let remaining = context.score;
  let opened = context.opened || context.inRule === "straight";

  while (darts.length < 3) {
    const dartsLeft = (3 - darts.length) as 1 | 2 | 3;
    const value = throwAiDart(level, chooseAiVisitAim(remaining, opened, context, dartsLeft, level), random).dart;
    darts.push(value);

    if (!opened && qualifiesIn(value, context.inRule)) opened = true;
    if (opened) remaining -= value.score;

    const bust = remaining < 0
      || (remaining === 1 && context.outRule !== "straight")
      || (remaining === 0 && !qualifiesOut(value, context.outRule));
    if (bust || remaining === 0) break;
  }

  return Object.freeze(darts);
}

function chooseAiVisitAim(remaining: number, opened: boolean, context: AiVisitContext, dartsLeft: 1 | 2 | 3, level: number): Aim {
  if (!opened) {
    return context.inRule === "double"
      ? { segment: 20, multiplier: 2 }
      : { segment: 20, multiplier: 3 };
  }
  if (context.outRule === "straight" && remaining >= 1 && remaining <= 20) {
    return { segment: remaining as BoardNumber, multiplier: 1 };
  }
  return chooseTacticalAim({ remaining, dartsLeft, outRule: context.outRule, level });
}

function qualifiesIn(value: Dart, rule: InRule): boolean {
  return rule === "straight" || value.multiplier === 2 || (rule === "master" && value.multiplier === 3);
}

function qualifiesOut(value: Dart, rule: OutRule): boolean {
  return rule === "straight" || value.multiplier === 2 || (rule === "master" && value.multiplier === 3);
}

function validateLevel(level: number) { if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error("AI level must be an integer from 1 to 20"); }

/**
 * How much tactical thinking a level is allowed.
 *
 * Accuracy alone made twenty levels into one player with twenty tremors: a
 * level 3 and a level 19 chose identical targets and differed only in how badly
 * they executed them. Decision quality is what separates a club player from a
 * tournament player, so it ladders too.
 *
 *   novice     — aims the biggest number it knows, takes any double it lands on
 *   competent  — finishes when a route exists, and knows which double it wants
 *   expert     — plans the whole visit, and sets up a leave when it cannot finish
 */
export type AiTactics = "novice" | "competent" | "expert";

export function aiTactics(level: number): AiTactics {
  validateLevel(level);
  return level <= 5 ? "novice" : level <= 12 ? "competent" : "expert";
}

export interface AiAimContext {
  readonly remaining: number;
  readonly dartsLeft: 1 | 2 | 3;
  readonly outRule: OutRule;
  readonly level: number;
}

/**
 * The target this AI would actually pick, given how well it thinks.
 *
 * Competent and expert players route through the same checkout planner the
 * product offers a human, so their decisions are defensible rather than
 * arbitrary. An expert additionally plans a setup visit when no finish exists,
 * which is what stops a strong bot grinding into a bogey number.
 */
export function chooseTacticalAim(context: AiAimContext): Aim {
  const { remaining, dartsLeft, outRule, level } = context;
  const tactics = aiTactics(level);
  if (tactics === "novice") return chooseAiAim(remaining);

  const advice = checkoutAdvice(remaining, dartsLeft, outRule);
  const first = advice.primaryPlan?.darts[0];
  if (first) return { segment: first.segment as BoardNumber, multiplier: first.multiplier };

  if (tactics === "expert") {
    const setup = advice.setupPlan?.darts[0];
    if (setup) return { segment: setup.segment as BoardNumber, multiplier: setup.multiplier };
  }
  return chooseAiAim(remaining);
}
