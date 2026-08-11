import type { Aim } from "@/domain/ai-throw";
import type { Dart } from "@/domain/darts";

export interface AiVisitRules<State> {
  /** True only while the same opponent may throw another dart. */
  readonly continues: (state: State) => boolean;
  /** Changes when the current visit settles, even if the same seat starts next. */
  readonly boundary: (state: State) => string | number;
  /** Chooses from the temporary state produced by every landing so far. */
  readonly target: (state: State, darts: readonly Dart[]) => Aim;
  /** Applies one landing to temporary state; it must not mutate the match log. */
  readonly apply: (state: State, dart: Dart) => State;
}

export interface CollectAiVisitOptions<State> {
  readonly initial: State;
  readonly rules: AiVisitRules<State>;
  readonly signal: AbortSignal;
  readonly sample: (target: Aim, signal: AbortSignal) => Promise<Dart>;
}

export class AiVisitSequenceError extends Error {
  readonly code = "invalid_ai_visit";

  constructor() {
    super("The AI visit did not hand the match back within three darts");
    this.name = "AiVisitSequenceError";
  }
}

/**
 * Builds one visit against temporary reducer state, then returns only its darts.
 *
 * Premium targets depend on the preceding physical landing: a Cricket mark may
 * close a number, Around the Clock may advance, and X01 may open, bust, or finish.
 * Requests therefore have to be sequential. Keeping every reducer transition in
 * this local projection also makes the visit atomic from the match's perspective:
 * if request two fails, the caller receives no array and commits no first dart.
 */
export async function collectAiVisit<State>(
  options: CollectAiVisitOptions<State>,
): Promise<readonly Dart[]> {
  const { rules, signal, sample } = options;
  let state = options.initial;
  const boundary = rules.boundary(state);
  const darts: Dart[] = [];

  while (
    darts.length < 3
    && rules.continues(state)
    && rules.boundary(state) === boundary
  ) {
    signal.throwIfAborted();
    const value = await sample(rules.target(state, darts), signal);
    signal.throwIfAborted();
    state = rules.apply(state, value);
    darts.push(value);
  }

  const settled = !rules.continues(state) || rules.boundary(state) !== boundary;
  if (darts.length === 0 || !settled) {
    throw new AiVisitSequenceError();
  }
  return Object.freeze(darts);
}
