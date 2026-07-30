/**
 * Turns a stream of loudness readings into clips worth transcribing.
 *
 * "Always-on" voice was one 4.5-second clip and a manual resume: it recorded for a
 * fixed time whether or not anybody spoke, and then stopped until it was asked
 * again. What makes it continuous is knowing when a person started talking and when
 * they stopped, so a clip is a sentence rather than a stopwatch.
 *
 * This is deliberately pure — it takes a number and a timestamp and returns what to
 * do — because the alternative is logic that can only be exercised with a
 * microphone, and microphone-only logic is logic nobody tests.
 */

export interface SegmenterOptions {
  /** Loudness (0–1 RMS) above which the room counts as somebody speaking. */
  readonly speechThreshold: number;
  /** Quiet for this long after speech closes the clip. */
  readonly silenceMs: number;
  /** A clip is cut here however long somebody keeps talking. */
  readonly maxClipMs: number;
  /** Speech shorter than this is a cough, a chair, a dart hitting the board. */
  readonly minSpeechMs: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  // Well above room tone and below a spoken score at arm's length. Tuned to reject
  // the board itself: a dart landing is loud but very short, which minSpeechMs
  // catches rather than this.
  speechThreshold: 0.045,
  silenceMs: 700,
  maxClipMs: 9000,
  minSpeechMs: 180,
};

export interface SegmenterState {
  readonly speaking: boolean;
  /** When the current run of speech began, or null between clips. */
  readonly startedAt: number | null;
  /** When the current run of quiet began, or null while somebody is talking. */
  readonly quietSince: number | null;
}

export type SegmenterEvent =
  | { readonly kind: "none" }
  | { readonly kind: "speech-started" }
  /** A clip worth sending, with the span it covers. */
  | { readonly kind: "clip"; readonly startedAt: number; readonly endedAt: number; readonly reason: "silence" | "length" }
  /** Speech too short to be a score. Nothing is sent and nothing is said about it. */
  | { readonly kind: "discarded" };

export function createSegmenter(): SegmenterState {
  return { speaking: false, startedAt: null, quietSince: null };
}

export function observeLevel(
  state: SegmenterState,
  rms: number,
  atMs: number,
  options: SegmenterOptions = DEFAULT_SEGMENTER,
): { readonly state: SegmenterState; readonly event: SegmenterEvent } {
  const loud = rms >= options.speechThreshold;

  if (!state.speaking) {
    if (!loud) return { state: { ...state, quietSince: state.quietSince ?? atMs }, event: { kind: "none" } };
    return { state: { speaking: true, startedAt: atMs, quietSince: null }, event: { kind: "speech-started" } };
  }

  const startedAt = state.startedAt ?? atMs;

  // A clip is cut at the ceiling even mid-sentence: somebody reading out a long
  // correction should still get the first part transcribed rather than nothing.
  if (atMs - startedAt >= options.maxClipMs) {
    return { state: createSegmenter(), event: { kind: "clip", startedAt, endedAt: atMs, reason: "length" } };
  }

  if (loud) return { state: { ...state, quietSince: null }, event: { kind: "none" } };

  const quietSince = state.quietSince ?? atMs;
  if (atMs - quietSince < options.silenceMs) {
    return { state: { ...state, quietSince }, event: { kind: "none" } };
  }

  // The clip ends where the talking did, not where the silence was noticed —
  // otherwise every clip carries the pause that closed it.
  const spokenMs = quietSince - startedAt;
  if (spokenMs < options.minSpeechMs) {
    return { state: createSegmenter(), event: { kind: "discarded" } };
  }
  return { state: createSegmenter(), event: { kind: "clip", startedAt, endedAt: quietSince, reason: "silence" } };
}

/** Root-mean-square loudness of a frame, 0–1. */
export function frameLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]!;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}
