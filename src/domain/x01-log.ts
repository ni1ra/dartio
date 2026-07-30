import { dart, type BoardNumber, type Dart, type Multiplier } from "./darts";
import {
  recordedDarts,
  recordedPlayer,
  type MatchRecord,
  type RecordedTurn,
  type SeatIdentity,
} from "./match-record";
import {
  applyAggregateVisit,
  createX01,
  type X01Options,
  type X01Player,
  type X01State,
} from "./x01";
import { applyDart } from "./x01";

/**
 * The canonical record of a match is what was thrown, not the state it produced.
 *
 * Every input surface — board, keypad, voice, AI — appends one of these. State
 * is derived by folding the pure X01 reducers over the log from a fresh match,
 * which is what makes three things possible that a snapshot stack cannot do:
 * correcting a dart from two visits ago, resuming exactly after a reload, and
 * replaying a finished leg. It also means correction has one implementation
 * rather than one per input surface.
 */
export type X01Event =
  | { readonly kind: "dart"; readonly segment: BoardNumber | 0; readonly multiplier: Multiplier; readonly x?: number; readonly y?: number }
  | { readonly kind: "visit"; readonly score: number; readonly dartsThrown: 1 | 2 | 3 };

export interface X01Log {
  readonly options: X01Options;
  readonly players: readonly X01Player[];
  readonly events: readonly X01Event[];
}

export interface RejectedEvent {
  readonly index: number;
  readonly reason: string;
}

export interface X01Replay {
  readonly state: X01State;
  /**
   * Events the rules refused, in log order. Non-empty only after a correction
   * invalidated something thrown later — replacing a dart can turn a legal
   * finish into a bust, and the visits after it may no longer be possible.
   * They are reported rather than silently dropped so the player can be told.
   */
  readonly rejected: readonly RejectedEvent[];
}

export function dartEvent(value: Dart): X01Event {
  return {
    kind: "dart",
    segment: value.segment,
    multiplier: value.multiplier,
    ...(value.x === undefined ? {} : { x: value.x }),
    ...(value.y === undefined ? {} : { y: value.y }),
  };
}

export function visitEvent(score: number, dartsThrown: 1 | 2 | 3): X01Event {
  return { kind: "visit", score, dartsThrown };
}

export function eventDart(event: Extract<X01Event, { kind: "dart" }>): Dart {
  return event.x === undefined || event.y === undefined
    ? dart(event.segment, event.multiplier)
    : dart(event.segment, event.multiplier, { x: event.x, y: event.y });
}

export function createLog(options: X01Options, players: readonly X01Player[]): X01Log {
  // Constructing the match here validates options and players immediately
  // rather than at the first replay of an already-persisted log.
  createX01(options, players);
  return { options, players, events: [] };
}

/**
 * Folds the log into a state. Deterministic: the same log always produces the
 * same state, which is what lets a reload resume exactly and a correction be
 * previewed before it is committed.
 */
export function replay(log: X01Log): X01Replay {
  let state = createX01(log.options, log.players);
  const rejected: RejectedEvent[] = [];

  log.events.forEach((event, index) => {
    if (state.status === "complete") {
      rejected.push({ index, reason: "The match was already complete" });
      return;
    }
    try {
      state = event.kind === "dart"
        ? applyDart(state, eventDart(event))
        : applyAggregateVisit(state, { score: event.score, dartsThrown: event.dartsThrown });
    } catch (problem) {
      rejected.push({ index, reason: problem instanceof Error ? problem.message : "Rejected by the rules" });
    }
  });

  return { state, rejected };
}

export function appendEvent(log: X01Log, event: X01Event): X01Log {
  return { ...log, events: [...log.events, event] };
}

export function undoLastEvent(log: X01Log): X01Log {
  return log.events.length === 0 ? log : { ...log, events: log.events.slice(0, -1) };
}

export function replaceEvent(log: X01Log, index: number, event: X01Event): X01Log {
  assertIndex(log, index);
  return { ...log, events: log.events.map((existing, position) => (position === index ? event : existing)) };
}

export function removeEvent(log: X01Log, index: number): X01Log {
  assertIndex(log, index);
  return { ...log, events: log.events.filter((_, position) => position !== index) };
}

/**
 * Rewinds the match to just before a completed visit, so it can be thrown again.
 *
 * This truncates rather than excises. Events carry what was thrown, not who
 * threw it — the player is derived from turn order — so cutting a visit out of
 * the middle would hand every later visit to the wrong player. Rewinding keeps
 * the sequence honest: everything up to the mistake stands, everything after it
 * is re-entered.
 */
export function rewindToVisit(log: X01Log, visitIndex: number): X01Log {
  const range = visitRange(log, visitIndex);
  if (!range) throw new RangeError(`No completed visit at index ${visitIndex}`);
  return { ...log, events: log.events.slice(0, range.start) };
}

/**
 * Replaces one completed visit in place, leaving the rest of the match to
 * replay around it. Safe where `rewindToVisit` is heavy-handed: the substituted
 * visit occupies the same position in the turn order, so nobody else's visits
 * change hands. Later events the correction invalidates are reported by
 * `replay`, not silently dropped.
 */
export function replaceVisit(log: X01Log, visitIndex: number, events: readonly X01Event[]): X01Log {
  const range = visitRange(log, visitIndex);
  if (!range) throw new RangeError(`No completed visit at index ${visitIndex}`);
  return { ...log, events: [...log.events.slice(0, range.start), ...events, ...log.events.slice(range.end)] };
}

/**
 * The half-open event range `[start, end)` that produced a completed visit.
 *
 * Derived by replaying rather than by counting darts: a visit can end on one
 * dart (a finish or a bust) or on three, and only the rules know which.
 */
export function visitRange(log: X01Log, visitIndex: number): { readonly start: number; readonly end: number } | null {
  if (!Number.isInteger(visitIndex) || visitIndex < 0) return null;
  let state = createX01(log.options, log.players);
  let completed = 0;
  let start = 0;

  for (const [index, event] of log.events.entries()) {
    let next: X01State;
    try {
      next = event.kind === "dart"
        ? applyDart(state, eventDart(event))
        : applyAggregateVisit(state, { score: event.score, dartsThrown: event.dartsThrown });
    } catch {
      // A rejected event belongs to no visit; skip it without ending the range.
      continue;
    }
    if (next.turns.length > state.turns.length) {
      if (completed === visitIndex) return { start, end: index + 1 };
      completed += 1;
      start = index + 1;
    }
    state = next;
    if (state.status === "complete") break;
  }

  return null;
}
/**
 * Reduces a finished X01 match to the one shape history is written in.
 *
 * `seats` carries the only thing the log does not know: whether a seat was played
 * by the AI and at what level. The log records what was thrown, not who or what
 * threw it, and that is deliberate — turn order decides the thrower — so the
 * caller that set the match up supplies it.
 */
export function x01MatchRecord(log: X01Log, seats: readonly SeatIdentity[] = []): MatchRecord {
  const { state } = replay(log);
  const seatOf = new Map(log.players.map((player, seat) => [player.id, seat]));
  const turns: RecordedTurn[] = state.turns.map((turn, index) => ({
    seat: seatOf.get(turn.playerId) ?? 0,
    turnNumber: index + 1,
    legNumber: turn.legNumber,
    scoreBefore: turn.scoreBefore,
    scoreAfter: turn.scoreAfter,
    bust: turn.bust,
    dartsThrown: turn.dartsThrown,
    ...(turn.source === "aggregate" && turn.aggregateScore !== undefined
      ? { aggregateScore: turn.aggregateScore }
      : {}),
    darts: recordedDarts(turn.darts),
  }));
  const winnerSeat = state.winnerId === undefined ? undefined : seatOf.get(state.winnerId);
  return {
    mode: "x01",
    options: { ...log.options },
    players: log.players.map((player, seat) => recordedPlayer(seat, player.name, seats[seat])),
    turns,
    ...(winnerSeat === undefined ? {} : { winnerSeat }),
  };
}

function assertIndex(log: X01Log, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= log.events.length) {
    throw new RangeError(`No event at index ${index}`);
  }
}
