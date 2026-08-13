import { dartFromEvent, type BoardNumber, type Dart, type Multiplier } from "./darts";
import {
  applyCustomPracticeDart,
  createCustomPractice,
  customPracticeSummary,
  type CustomPracticeState,
  type PracticeTarget,
} from "./custom-practice";
import { recordedDarts, recordedPlayer, type MatchRecord, type RecordedTurn } from "./match-record";

export interface CustomPracticeEvent {
  readonly kind: "dart";
  readonly segment: BoardNumber | 0;
  readonly multiplier: Multiplier;
  readonly x?: number;
  readonly y?: number;
}

export interface CustomPracticeLog {
  readonly targets: readonly PracticeTarget[];
  readonly events: readonly CustomPracticeEvent[];
}

export function customPracticeDartEvent(value: Dart): CustomPracticeEvent {
  return {
    kind: "dart",
    segment: value.segment,
    multiplier: value.multiplier,
    ...(value.x === undefined ? {} : { x: value.x }),
    ...(value.y === undefined ? {} : { y: value.y }),
  };
}

export function createCustomPracticeLog(targets: readonly PracticeTarget[]): CustomPracticeLog {
  const state = createCustomPractice(targets);
  return { targets: state.targets, events: [] };
}

export function replayCustomPractice(log: CustomPracticeLog): {
  readonly state: CustomPracticeState;
  readonly rejected: readonly number[];
} {
  let state = createCustomPractice(log.targets);
  const rejected: number[] = [];
  log.events.forEach((event, index) => {
    if (state.status === "complete") { rejected.push(index); return; }
    try {
      state = applyCustomPracticeDart(state, dartFromEvent(event));
    } catch {
      rejected.push(index);
    }
  });
  return { state, rejected };
}

export function appendCustomPracticeEvent(
  log: CustomPracticeLog,
  event: CustomPracticeEvent,
): CustomPracticeLog {
  return { ...log, events: [...log.events, event] };
}

export function undoLastCustomPracticeEvent(log: CustomPracticeLog): CustomPracticeLog {
  return log.events.length === 0 ? log : { ...log, events: log.events.slice(0, -1) };
}

/** Stores hits as a running total while preserving every exact landing. */
export function customPracticeMatchRecord(log: CustomPracticeLog): MatchRecord {
  const { state } = replayCustomPractice(log);
  let runningHits = 0;
  const turns: RecordedTurn[] = state.attempts.map((attempt, index) => {
    const scoreBefore = runningHits;
    if (attempt.hit) runningHits += 1;
    return {
      seat: 0,
      turnNumber: index + 1,
      legNumber: 1,
      scoreBefore,
      scoreAfter: runningHits,
      bust: false,
      dartsThrown: attempt.darts.length as 1 | 2 | 3,
      darts: recordedDarts(attempt.darts),
    };
  });
  const summary = customPracticeSummary(state);
  return {
    mode: "customPractice",
    options: {
      rulesVersion: 1,
      targets: log.targets.map((target) => ({ ...target })),
      hits: summary.hits,
    },
    players: [recordedPlayer(0, "You")],
    turns,
  };
}
