import { dart, type BoardNumber, type Dart, type Multiplier } from "./darts";
import { applyRoundDart, createRoundMatch, type RoundModeId, type RoundPlayer, type RoundState } from "./round-modes";

/**
 * The event log for the round-based modes. Same contract as X01's and
 * Cricket's — a dart is the only event, state is derived by replay — so these
 * four modes inherit correction, resume, and deterministic replay for free.
 */
export interface RoundEvent {
  readonly kind: "dart";
  readonly segment: BoardNumber | 0;
  readonly multiplier: Multiplier;
  readonly x?: number;
  readonly y?: number;
}

export interface RoundLog {
  readonly mode: RoundModeId;
  readonly players: readonly RoundPlayer[];
  readonly events: readonly RoundEvent[];
}

export function roundDartEvent(value: Dart): RoundEvent {
  return {
    kind: "dart", segment: value.segment, multiplier: value.multiplier,
    ...(value.x === undefined ? {} : { x: value.x }),
    ...(value.y === undefined ? {} : { y: value.y }),
  };
}

function toDart(event: RoundEvent): Dart {
  return event.x === undefined || event.y === undefined
    ? dart(event.segment, event.multiplier)
    : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
}

export function createRoundLog(mode: RoundModeId, players: readonly RoundPlayer[]): RoundLog {
  createRoundMatch(mode, players);
  return { mode, players, events: [] };
}

export function replayRound(log: RoundLog): { state: RoundState; rejected: readonly number[] } {
  let state = createRoundMatch(log.mode, log.players);
  const rejected: number[] = [];
  log.events.forEach((event, index) => {
    try {
      state = applyRoundDart(state, toDart(event));
    } catch {
      rejected.push(index);
    }
  });
  return { state, rejected };
}

export function appendRoundEvent(log: RoundLog, event: RoundEvent): RoundLog {
  return { ...log, events: [...log.events, event] };
}

export function undoLastRoundEvent(log: RoundLog): RoundLog {
  return log.events.length === 0 ? log : { ...log, events: log.events.slice(0, -1) };
}

/** Rewinds to just before a completed visit, for the reason every mode does. */
export function rewindRoundToVisit(log: RoundLog, visitIndex: number): RoundLog {
  if (!Number.isInteger(visitIndex) || visitIndex < 0) throw new RangeError(`No completed visit at index ${visitIndex}`);
  let state = createRoundMatch(log.mode, log.players);
  let completed = 0;
  let start = 0;
  for (const [index, event] of log.events.entries()) {
    let next: RoundState;
    try { next = applyRoundDart(state, toDart(event)); } catch { continue; }
    if (next.visits.length > state.visits.length) {
      if (completed === visitIndex) return { ...log, events: log.events.slice(0, start) };
      completed += 1;
      start = index + 1;
    }
    state = next;
    if (state.status === "complete") break;
  }
  throw new RangeError(`No completed visit at index ${visitIndex}`);
}
