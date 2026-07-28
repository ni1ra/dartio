import type { Dart } from "./darts";

/**
 * Cricket, the second full mode.
 *
 * Shares the shape X01 established — immutable state, pure reducers, a turn
 * record per completed visit — so the same event log, correction, and resume
 * machinery works unchanged. Nothing here imports X01; a mode owns its own
 * rules, and adding one must never require editing another.
 */

/** The scoring numbers, high to low, then the bull. */
export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;
export type CricketNumber = (typeof CRICKET_NUMBERS)[number];

export type CricketVariant =
  /** Points to the player who owns a number the opponent has not closed. */
  | "standard"
  /** Points go to every opponent who has not closed it; lowest score wins. */
  | "cut-throat"
  /** No points at all — first to close everything wins. */
  | "tactics";

export interface CricketOptions {
  readonly variant: CricketVariant;
  /** Draws are broken by a two-mark margin. Meaningless in tactics. */
  readonly winByTwo: boolean;
  /** Optional cap; the leader on marks then points takes it. Null for no cap. */
  readonly roundLimit: number | null;
}

export interface CricketPlayer { readonly id: string; readonly name: string }

export interface CricketTurnRecord {
  readonly playerId: string;
  readonly darts: readonly Dart[];
  readonly dartsThrown: 1 | 2 | 3;
  /** Marks closed by the whole visit, capped at what each number still needed. */
  readonly marksScored: number;
  /** Points the visit produced. In cut-throat these were inflicted on opponents. */
  readonly pointsScored: number;
  readonly round: number;
}

export interface CricketState {
  readonly options: CricketOptions;
  readonly players: readonly CricketPlayer[];
  /** marks[player][number] — 0 to 3, where 3 is closed. */
  readonly marks: readonly (readonly number[])[];
  readonly points: readonly number[];
  readonly currentPlayer: number;
  readonly currentDarts: readonly Dart[];
  /** Marks and points accumulated by the visit in progress. */
  readonly currentMarks: number;
  readonly currentPoints: number;
  readonly round: number;
  readonly turns: readonly CricketTurnRecord[];
  readonly status: "playing" | "complete";
  readonly winnerId?: string;
}

export function createCricket(options: CricketOptions, players: readonly CricketPlayer[]): CricketState {
  validateOptions(options);
  if (players.length < 2 || players.some((player) => !player.id || !player.name)) {
    throw new Error("Cricket needs at least two named players");
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error("Player ids must be unique");
  }
  return Object.freeze({
    options: { ...options },
    players: players.map((player) => ({ ...player })),
    marks: players.map(() => CRICKET_NUMBERS.map(() => 0)),
    points: players.map(() => 0),
    currentPlayer: 0,
    currentDarts: [],
    currentMarks: 0,
    currentPoints: 0,
    round: 1,
    turns: [],
    status: "playing",
  });
}

export function isCricketNumber(segment: number): segment is CricketNumber {
  return (CRICKET_NUMBERS as readonly number[]).includes(segment);
}

/**
 * Marks a dart is worth: its multiplier, if it landed on a scoring number.
 * A treble is three, a double two, a single one. The bull has no treble ring,
 * so a double bull is two marks and an outer bull is one.
 */
export function dartMarks(value: Dart): number {
  return isCricketNumber(value.segment) ? value.multiplier : 0;
}

export function hasClosed(state: CricketState, player: number, target: CricketNumber): boolean {
  return (state.marks[player]?.[CRICKET_NUMBERS.indexOf(target)] ?? 0) >= 3;
}

/** True when every opponent has closed the number, so it can no longer score. */
function deadForScoring(state: CricketState, player: number, target: CricketNumber): boolean {
  return state.players.every((_, index) => index === player || hasClosed(state, index, target));
}

export function applyCricketDart(state: CricketState, value: Dart): CricketState {
  if (state.status === "complete") throw new Error("The match is complete");

  const player = state.currentPlayer;
  const marks = state.marks.map((row) => [...row]);
  const points = [...state.points];
  let marksScored = 0;
  let pointsScored = 0;

  if (isCricketNumber(value.segment)) {
    const index = CRICKET_NUMBERS.indexOf(value.segment);
    const hits = dartMarks(value);
    const before = marks[player]![index]!;
    const toClose = Math.max(0, 3 - before);
    const closing = Math.min(hits, toClose);
    marks[player]![index] = before + closing;
    marksScored = closing;

    // Overflow scores only once the number is closed and an opponent has not
    // closed it. Tactics has no scoring at all.
    const overflow = hits - closing;
    if (overflow > 0 && state.options.variant !== "tactics" && !deadForScoring(state, player, value.segment)) {
      pointsScored = overflow * value.segment;
      if (state.options.variant === "cut-throat") {
        // Cut-throat gives the points to everyone who has not closed it, and
        // the lowest score wins — so scoring is a penalty you inflict.
        state.players.forEach((_, index2) => {
          if (index2 !== player && !hasClosed(state, index2, value.segment as CricketNumber)) {
            points[index2] = (points[index2] ?? 0) + pointsScored;
          }
        });
      } else {
        points[player] = (points[player] ?? 0) + pointsScored;
      }
    }
  }

  const darts = [...state.currentDarts, value];
  const visitMarks = state.currentMarks + marksScored;
  const visitPoints = state.currentPoints + pointsScored;
  const next: CricketState = {
    ...state, marks, points, currentDarts: darts,
    currentMarks: visitMarks, currentPoints: visitPoints,
  };
  const winner = findWinner(next);
  if (winner !== null) {
    return Object.freeze({
      ...next,
      turns: [...state.turns, turnRecord(state, darts, visitMarks, visitPoints)],
      currentDarts: [],
      currentMarks: 0,
      currentPoints: 0,
      status: "complete",
      winnerId: state.players[winner]!.id,
    });
  }
  if (darts.length < 3) return Object.freeze(next);
  return advance(next, turnRecord(state, darts, visitMarks, visitPoints));
}

function advance(state: CricketState, turn: CricketTurnRecord): CricketState {
  const currentPlayer = (state.currentPlayer + 1) % state.players.length;
  const round = currentPlayer === 0 ? state.round + 1 : state.round;
  const settled: CricketState = {
    ...state,
    turns: [...state.turns, turn],
    currentPlayer,
    currentDarts: [],
    currentMarks: 0,
    currentPoints: 0,
    round,
  };
  // A round cap is only reached once every player has had the same number of
  // visits, which is exactly when the turn returns to the first player.
  if (state.options.roundLimit !== null && currentPlayer === 0 && round > state.options.roundLimit) {
    const leader = leaderOnCap(settled);
    return Object.freeze({
      ...settled,
      status: "complete",
      ...(leader === null ? {} : { winnerId: state.players[leader]!.id }),
    });
  }
  return Object.freeze(settled);
}

function turnRecord(state: CricketState, darts: readonly Dart[], marksScored: number, pointsScored: number): CricketTurnRecord {
  return {
    playerId: state.players[state.currentPlayer]!.id,
    darts,
    dartsThrown: darts.length as 1 | 2 | 3,
    marksScored,
    pointsScored,
    round: state.round,
  };
}

/**
 * A player wins by closing every number while their points position is not
 * losing. Standard wants the most points, cut-throat the fewest, tactics
 * ignores points entirely.
 */
function findWinner(state: CricketState): number | null {
  const closedAll = state.players.map((_, index) =>
    CRICKET_NUMBERS.every((target) => hasClosed(state, index, target)));
  const candidates = closedAll.flatMap((closed, index) => (closed ? [index] : []));
  if (candidates.length === 0) return null;

  if (state.options.variant === "tactics") return candidates[0]!;

  const better = state.options.variant === "cut-throat"
    ? (a: number, b: number) => a < b
    : (a: number, b: number) => a > b;

  for (const candidate of candidates) {
    const mine = state.points[candidate] ?? 0;
    const others = state.players
      .map((_, index) => index)
      .filter((index) => index !== candidate)
      .map((index) => state.points[index] ?? 0);
    const ahead = others.every((score) => better(mine, score));
    const level = others.every((score) => score === mine);
    if (ahead) return candidate;
    // Level on points is a win unless a two-mark margin was demanded.
    if (level && !state.options.winByTwo) return candidate;
  }
  return null;
}

function leaderOnCap(state: CricketState): number | null {
  const rank = state.players.map((_, index) => ({
    index,
    marks: (state.marks[index] ?? []).reduce((total, value) => total + Math.min(value, 3), 0),
    points: state.points[index] ?? 0,
  }));
  const sorted = [...rank].sort((a, b) =>
    b.marks - a.marks
    || (state.options.variant === "cut-throat" ? a.points - b.points : b.points - a.points));
  const [first, second] = sorted;
  if (!first) return null;
  if (second && first.marks === second.marks && first.points === second.points) return null;
  return first.index;
}

export interface CricketPlayerStats {
  readonly playerId: string;
  readonly marks: number;
  readonly points: number;
  readonly dartsThrown: number;
  /** Marks per round: the standard measure of Cricket scoring power. */
  readonly marksPerRound: number;
  readonly closed: readonly CricketNumber[];
}

export function cricketPlayerStats(state: CricketState, playerId: string): CricketPlayerStats {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error(`Unknown Cricket player: ${playerId}`);
  const completed = state.turns.filter((turn) => turn.playerId === playerId);
  const dartsThrown = completed.reduce((total, turn) => total + turn.dartsThrown, 0)
    + (state.currentPlayer === index ? state.currentDarts.length : 0);
  const marks = (state.marks[index] ?? []).reduce((total, value) => total + Math.min(value, 3), 0);
  return {
    playerId,
    marks,
    points: state.points[index] ?? 0,
    dartsThrown,
    marksPerRound: dartsThrown === 0 ? 0 : marks * 3 / dartsThrown,
    closed: CRICKET_NUMBERS.filter((target) => hasClosed(state, index, target)),
  };
}

function validateOptions(options: CricketOptions): void {
  if (!["standard", "cut-throat", "tactics"].includes(options.variant)) {
    throw new Error("Cricket variant must be standard, cut-throat, or tactics");
  }
  if (options.roundLimit !== null && (!Number.isInteger(options.roundLimit) || options.roundLimit < 1 || options.roundLimit > 99)) {
    throw new Error("Cricket round limit must be null or an integer from 1 to 99");
  }
}
