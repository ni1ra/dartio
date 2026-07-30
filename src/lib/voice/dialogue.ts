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
export type VoiceMode = "x01" | "cricket" | "round" | "drill";

export interface PendingUtterance {
  readonly id: number;
  readonly text: string;
  readonly command: VoiceCommand;
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
  // A drill is one player at one target, so there is nobody to pass to.
  if (command.type === "next_player") return mode !== "drill";
  return true;
}

export interface HearOptions {
  /**
   * Below this, a transcription is held for confirmation instead of applied.
   * A misheard score is worse than a slow one — it silently changes the game.
   */
  readonly confidenceFloor?: number;
  readonly confidence?: number;
}

export function hear(
  state: DialogueState,
  text: string,
  mode: VoiceMode,
  options: HearOptions = {},
): DialogueOutcome {
  const command = parseVoiceCommand(text);
  if (!command) return { kind: "unheard", text, state };

  if (command.type === "confirm") {
    const [oldest, ...rest] = state.queue;
    if (!oldest) return { kind: "nothing-pending", state };
    return { kind: "confirmed", command: oldest.command, state: { ...state, queue: rest } };
  }
  if (command.type === "cancel") {
    const [oldest, ...rest] = state.queue;
    if (!oldest) return { kind: "nothing-pending", state };
    return { kind: "cancelled", text: oldest.text, state: { ...state, queue: rest } };
  }

  if (!speaks(mode, command)) return { kind: "out-of-vocabulary", command, state };

  const floor = options.confidenceFloor ?? 0.6;
  const confidence = options.confidence ?? 1;
  if (confidence >= floor) return { kind: "apply", command, state };

  const pending: PendingUtterance = { id: state.nextId, text, command };
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
