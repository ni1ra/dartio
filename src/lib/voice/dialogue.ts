import { parseVoiceCommand, type VoiceCommand } from "./commands";

/**
 * What the product does with something it heard.
 *
 * Two things were missing rather than wrong. `confirm` and `cancel` were parsed and
 * then dropped on the floor — there was nothing to confirm, because every clip was
 * applied the moment it was understood. And every mode was offered the same
 * vocabulary, so a Cricket player could say "score sixty" into a game that has no
 * such thing as a visit total.
 *
 * Both are fixed here, and both are pure: what to do with an utterance is decided
 * without a microphone, a network, or a match.
 */

/** Which vocabulary a mode speaks. Modes that share one share it honestly. */
export type VoiceMode = "x01" | "cricket" | "round" | "drill" | "room";

export interface PendingUtterance {
  readonly id: number;
  readonly text: string;
  readonly command: VoiceCommand;
  /** The signal that caused this utterance to be held, retained for honest UI copy. */
  readonly confidence: number;
  readonly reason: "confidence" | "queue" | "forced-review";
}

export interface DialogueState {
  /** Oldest first. Confirming takes from the front, the way a queue should. */
  readonly queue: readonly PendingUtterance[];
  readonly nextId: number;
}

export type DialogueOutcome =
  /** Understood and unambiguous: do it now. */
  | { readonly kind: "apply"; readonly command: VoiceCommand; readonly state: DialogueState }
  /** Understood but worth checking: held until confirmed or cancelled. */
  | { readonly kind: "queued"; readonly pending: PendingUtterance; readonly state: DialogueState }
  | { readonly kind: "confirmed"; readonly command: VoiceCommand; readonly state: DialogueState }
  | { readonly kind: "cancelled"; readonly text: string; readonly state: DialogueState }
  /** A doubtful control word never resolves a doubtful score. */
  | { readonly kind: "uncertain-control"; readonly command: VoiceCommand; readonly state: DialogueState }
  /** Heard, understood, and not something this mode can do. */
  | { readonly kind: "out-of-vocabulary"; readonly command: VoiceCommand; readonly state: DialogueState }
  | { readonly kind: "unheard"; readonly text: string; readonly state: DialogueState }
  /** A control word with nothing waiting on it. */
  | { readonly kind: "nothing-pending"; readonly state: DialogueState };

export function createDialogue(): DialogueState {
  return { queue: [], nextId: 1 };
}

/**
 * A visit total is X01's alone. Cricket scores marks on specific beds, the round
 * modes score specific targets, and a drill scores an attempt — in none of them
 * does "score sixty" name anything, so it is refused rather than half-understood.
 */
export function speaks(mode: VoiceMode, command: VoiceCommand): boolean {
  if (command.type === "turn_score") return mode === "x01";
  // Only X01 exposes a legacy explanatory path for this phrase. Every other
  // reducer requires actual darts to settle a visit and must not synthesize one.
  if (command.type === "next_player") return mode === "x01";
  return true;
}

export interface HearOptions {
  /**
   * Below this, a transcription is held for confirmation instead of applied.
   * A misheard score is worse than a slow one — it silently changes the game.
   */
  readonly confidenceFloor?: number;
  readonly confidence?: number;
  /** Push-to-talk is a deliberate one-shot input and always waits for review. */
  readonly forceReview?: boolean;
}

export function hear(
  state: DialogueState,
  text: string,
  mode: VoiceMode,
  options: HearOptions = {},
): DialogueOutcome {
  return hearCommand(state, text, parseVoiceCommand(text), mode, options);
}

/**
 * Routes a command that was parsed at the transcription boundary.
 *
 * Production uses the server's command instead of parsing the transcript a
 * second time in the browser. That keeps one authority for what was heard while
 * retaining `hear` as the convenient text-only entry point for pure tests.
 */
export function hearCommand(
  state: DialogueState,
  text: string,
  command: VoiceCommand | null,
  mode: VoiceMode,
  options: HearOptions = {},
): DialogueOutcome {
  if (!command) return { kind: "unheard", text, state };

  const floor = options.confidenceFloor ?? 0.6;
  const suppliedConfidence = options.confidence ?? 1;
  const confidence = Number.isFinite(suppliedConfidence)
    ? Math.min(1, Math.max(0, suppliedConfidence))
    : 0;

  if (command.type === "confirm") {
    if (confidence < floor) return { kind: "uncertain-control", command, state };
    const [oldest, ...rest] = state.queue;
    if (!oldest) return { kind: "nothing-pending", state };
    return { kind: "confirmed", command: oldest.command, state: { ...state, queue: rest } };
  }
  if (command.type === "cancel") {
    if (confidence < floor) return { kind: "uncertain-control", command, state };
    const [oldest, ...rest] = state.queue;
    if (!oldest) return { kind: "nothing-pending", state };
    return { kind: "cancelled", text: oldest.text, state: { ...state, queue: rest } };
  }

  if (!speaks(mode, command)) return { kind: "out-of-vocabulary", command, state };

  // Once review is waiting, later gameplay commands join the back of the queue.
  // Applying a newer command first would change the match underneath the oldest.
  if (confidence >= floor && state.queue.length === 0 && !options.forceReview)
    return { kind: "apply", command, state };

  const pending: PendingUtterance = {
    id: state.nextId,
    text,
    command,
    confidence,
    reason: options.forceReview
      ? "forced-review"
      : confidence < floor
        ? "confidence"
        : "queue",
  };
  return { kind: "queued", pending, state: { queue: [...state.queue, pending], nextId: state.nextId + 1 } };
}

/** What is waiting on the player, oldest first, for a surface to show. */
export function pending(state: DialogueState): readonly PendingUtterance[] {
  return state.queue;
}

/** Drops everything held. Used when a match moves on and the queue is stale. */
export function clearDialogue(state: DialogueState): DialogueState {
  return { ...state, queue: [] };
}
