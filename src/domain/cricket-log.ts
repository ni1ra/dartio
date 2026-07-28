import { dart, type BoardNumber, type Dart, type Multiplier } from "./darts";
import { applyCricketDart, createCricket, type CricketOptions, type CricketPlayer, type CricketState } from "./cricket";

/**
 * The Cricket event log, deliberately the same shape as X01's.
 *
 * Cricket has no aggregate visit — a mark only means something on a specific
 * bed — so its event is always a dart. Everything else is identical, which is
 * the point: a mode brings its own rules and inherits correction, resume, and
 * replay without either mode knowing about the other.
 */
export type CricketEvent = {
  readonly kind: "dart";
  readonly segment: BoardNumber | 0;
  readonly multiplier: Multiplier;
  readonly x?: number;
  readonly y?: number;
};

export interface CricketLog {
  readonly options: CricketOptions;
  readonly players: readonly CricketPlayer[];
  readonly events: readonly CricketEvent[];
}

export interface CricketReplay {
  readonly state: CricketState;
  readonly rejected: readonly { readonly index: number; readonly reason: string }[];
}

export function cricketDartEvent(value: Dart): CricketEvent {
  return {
    kind: "dart",
    segment: value.segment,
    multiplier: value.multiplier,
    ...(value.x === undefined ? {} : { x: value.x }),
    ...(value.y === undefined ? {} : { y: value.y }),
  };
}

export function createCricketLog(options: CricketOptions, players: readonly CricketPlayer[]): CricketLog {
  createCricket(options, players);
  return { options, players, events: [] };
}

export function replayCricket(log: CricketLog): CricketReplay {
  let state = createCricket(log.options, log.players);
  const rejected: { index: number; reason: string }[] = [];
  log.events.forEach((event, index) => {
    if (state.status === "complete") {
      rejected.push({ index, reason: "The match was already complete" });
      return;
    }
    try {
      const value = event.x === undefined || event.y === undefined
        ? dart(event.segment, event.multiplier)
        : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
      state = applyCricketDart(state, value);
    } catch (problem) {
      rejected.push({ index, reason: problem instanceof Error ? problem.message : "Rejected by the rules" });
    }
  });
  return { state, rejected };
}

export function appendCricketEvent(log: CricketLog, event: CricketEvent): CricketLog {
  return { ...log, events: [...log.events, event] };
}

export function undoLastCricketEvent(log: CricketLog): CricketLog {
  return log.events.length === 0 ? log : { ...log, events: log.events.slice(0, -1) };
}

/**
 * Rewinds to just before a completed visit, for the same reason X01 does:
 * events record what was thrown and turn order decides who threw it, so
 * excising a visit from the middle would reassign every later one.
 */
export function rewindCricketToVisit(log: CricketLog, visitIndex: number): CricketLog {
  if (!Number.isInteger(visitIndex) || visitIndex < 0) throw new RangeError(`No completed visit at index ${visitIndex}`);
  let state = createCricket(log.options, log.players);
  let completed = 0;
  let start = 0;
  for (const [index, event] of log.events.entries()) {
    let next: CricketState;
    try {
      const value = event.x === undefined || event.y === undefined
        ? dart(event.segment, event.multiplier)
        : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
      next = applyCricketDart(state, value);
    } catch {
      continue;
    }
    if (next.turns.length > state.turns.length) {
      if (completed === visitIndex) return { ...log, events: log.events.slice(0, start) };
      completed += 1;
      start = index + 1;
    }
    state = next;
    if (state.status === "complete") break;
  }
  throw new RangeError(`No completed visit at index ${visitIndex}`);
}
