import { dart, type BoardNumber, type Dart, type Multiplier } from "./darts";
import { applyDrillDart, createDrill, DRILLS, type DrillId, type DrillState } from "./drills";
import {
  recordedDarts,
  recordedPlayer,
  type MatchRecord,
  type RecordedTurn,
  type SeatIdentity,
} from "./match-record";

/**
 * The event log for the practice drills. Same contract as every other mode's — a
 * dart is the only event, state is derived by replay — so the drills inherit
 * correction, resume, and deterministic replay without a line of their own.
 */
export interface DrillEvent {
  readonly kind: "dart";
  readonly segment: BoardNumber | 0;
  readonly multiplier: Multiplier;
  readonly x?: number;
  readonly y?: number;
}

export interface DrillLog {
  readonly drill: DrillId;
  readonly events: readonly DrillEvent[];
}

export function drillDartEvent(value: Dart): DrillEvent {
  return {
    kind: "dart", segment: value.segment, multiplier: value.multiplier,
    ...(value.x === undefined ? {} : { x: value.x }),
    ...(value.y === undefined ? {} : { y: value.y }),
  };
}

function toDart(event: DrillEvent): Dart {
  return event.x === undefined || event.y === undefined
    ? dart(event.segment, event.multiplier)
    : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
}

export function createDrillLog(drill: DrillId): DrillLog {
  createDrill(drill);
  return { drill, events: [] };
}

export function replayDrill(log: DrillLog): { state: DrillState; rejected: readonly number[] } {
  let state = createDrill(log.drill);
  const rejected: number[] = [];
  log.events.forEach((event, index) => {
    if (state.status === "complete") { rejected.push(index); return; }
    try {
      state = applyDrillDart(state, toDart(event));
    } catch {
      rejected.push(index);
    }
  });
  return { state, rejected };
}

export function appendDrillEvent(log: DrillLog, event: DrillEvent): DrillLog {
  return { ...log, events: [...log.events, event] };
}

export function undoLastDrillEvent(log: DrillLog): DrillLog {
  return log.events.length === 0 ? log : { ...log, events: log.events.slice(0, -1) };
}

/** Rewinds to just before a completed attempt, for the reason every mode does. */
export function rewindDrillToAttempt(log: DrillLog, attemptIndex: number): DrillLog {
  if (!Number.isInteger(attemptIndex) || attemptIndex < 0) throw new RangeError(`No completed attempt at index ${attemptIndex}`);
  let state = createDrill(log.drill);
  let completed = 0;
  let start = 0;
  for (const [index, event] of log.events.entries()) {
    let next: DrillState;
    try { next = applyDrillDart(state, toDart(event)); } catch { continue; }
    if (next.attempts.length > state.attempts.length) {
      if (completed === attemptIndex) return { ...log, events: log.events.slice(0, start) };
      completed += 1;
      start = index + 1;
    }
    state = next;
    if (state.status === "complete") break;
  }
  throw new RangeError(`No completed attempt at index ${attemptIndex}`);
}

/**
 * Reduces a finished drill to the shape history is written in.
 *
 * A drill has no opponent and nobody wins it, so there is one seat and no winner.
 * The before/after pair is the running total in the drill's own unit — checkouts
 * taken, doubles hit, or points scored — which is the number a player is actually
 * trying to move.
 */
export function drillMatchRecord(log: DrillLog, seats: readonly SeatIdentity[] = []): MatchRecord {
  const { state } = replayDrill(log);
  let running = 0;
  const turns: RecordedTurn[] = state.attempts.map((attempt, index) => {
    const before = running;
    running += attempt.scored;
    return {
      seat: 0,
      turnNumber: index + 1,
      legNumber: 1,
      scoreBefore: before,
      scoreAfter: running,
      bust: false,
      dartsThrown: (attempt.darts.length || 1) as 1 | 2 | 3,
      darts: recordedDarts(attempt.darts),
    };
  });

  return {
    mode: log.drill,
    // The ladder is fixed per drill, so the only thing worth storing is which one.
    options: { attempts: DRILLS[log.drill].attempts, unit: DRILLS[log.drill].unit },
    players: [recordedPlayer(0, "You", seats[0])],
    turns,
  };
}
