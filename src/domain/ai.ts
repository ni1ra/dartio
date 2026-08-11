import { checkoutAdvice } from "./checkout";
import { throwAiDart, type Aim } from "./ai-throw";
import { type BoardNumber, type Dart } from "./darts";
import { applyDart, createX01, type InRule, type OutRule, type X01State } from "./x01";

export interface AiVisitContext {
  readonly score: number;
  readonly opened: boolean;
  readonly inRule: InRule;
  readonly outRule: OutRule;
}

export function chooseAiAim(remaining: number): Aim {
  if (remaining === 50) return { segment: 25, multiplier: 2 };
  if (remaining > 1 && remaining <= 40 && remaining % 2 === 0) return { segment: (remaining / 2) as BoardNumber, multiplier: 2 };
  return { segment: 20, multiplier: 3 };
}

/**
 * The X01 target policy used by both the real match and its benchmark.
 *
 * Keeping this beside tactics—but outside the execution sampler—means the
 * client owns every X01 rule while `/api/ai/throw` sees only the selected bed.
 */
export function chooseX01Aim(state: X01State, player: number, level: number): Aim {
  validateLevel(level);
  if (
    state.status !== "playing"
    || state.currentPlayer !== player
    || !state.players[player]
  ) {
    throw new RangeError("X01 AI target requires the current playing seat");
  }

  const opened = state.opened[player] ?? state.options.inRule === "straight";
  if (!opened) {
    return state.options.inRule === "double"
      ? { segment: 20, multiplier: 2 }
      : { segment: 20, multiplier: 3 };
  }

  const remaining = state.scores[player] ?? state.options.startingScore;
  if (state.options.outRule === "straight" && remaining >= 1 && remaining <= 20) {
    return { segment: remaining as BoardNumber, multiplier: 1 };
  }
  const dartsLeft = (3 - state.currentDarts.length) as 1 | 2 | 3;
  return chooseTacticalAim({ remaining, dartsLeft, outRule: state.options.outRule, level });
}

/** Generates one complete visit through the same reducer and policy as the UI. */
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

  let state = createX01({
    // X01 setup itself starts at two or more, but a transient straight-out
    // position may legitimately have one remaining.
    startingScore: Math.max(2, context.score),
    legsToWin: 1,
    setsToWin: 1,
    inRule: context.inRule,
    outRule: context.outRule,
  }, [{ id: "ai", name: "AI" }]);
  if (context.score === 1 || (context.opened && !(state.opened[0] ?? false))) {
    state = Object.freeze({
      ...state,
      scores: [context.score],
      turnStartScore: context.score,
      opened: [context.opened || context.inRule === "straight"],
    });
  }

  const boundary = state.turns.length;
  const darts: Dart[] = [];
  while (
    darts.length < 3
    && state.status === "playing"
    && state.turns.length === boundary
  ) {
    const value = throwAiDart(level, chooseX01Aim(state, 0, level), random).dart;
    darts.push(value);
    state = applyDart(state, value);
  }

  return Object.freeze(darts);
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
