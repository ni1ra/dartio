import type { Dart } from "./darts";

export type InRule = "straight" | "double" | "master";
export type OutRule = "straight" | "double" | "master";
export type StartingScore = 301 | 501 | 701 | number;

export interface X01Options {
  readonly startingScore: StartingScore;
  readonly legsToWin: number;
  readonly setsToWin: number;
  readonly inRule: InRule;
  readonly outRule: OutRule;
}

export interface X01Player { readonly id: string; readonly name: string }
export interface TurnRecord {
  readonly playerId: string;
  readonly legNumber: number;
  readonly source: "darts" | "aggregate";
  readonly darts: readonly Dart[];
  readonly dartsThrown: 1 | 2 | 3;
  readonly aggregateScore?: number;
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
}

export interface AggregateVisitInput {
  /** Counted visit score. No dart beds, order, or coordinates are inferred. */
  readonly score: number;
  readonly dartsThrown: 1 | 2 | 3;
}

export type AggregateSequenceReason = "in-rule" | "out-rule" | "mixed-entry";

export class AggregateVisitRequiresDartsError extends Error {
  readonly code = "DART_SEQUENCE_REQUIRED";
  constructor(readonly reason: AggregateSequenceReason) {
    super(`Per-dart entry is required to resolve the ${reason}`);
    this.name = "AggregateVisitRequiresDartsError";
  }
}

export interface X01PlayerStats {
  readonly playerId: string;
  readonly pointsScored: number;
  readonly dartsThrown: number;
  readonly visits: number;
  readonly threeDartAverage: number;
}

interface X01Snapshot {
  readonly scores: readonly number[];
  readonly opened: readonly boolean[];
  readonly legs: readonly number[];
  readonly sets: readonly number[];
  readonly legNumber: number;
  readonly currentPlayer: number;
  readonly legStarter: number;
  readonly turnStartScore: number;
  readonly currentDarts: readonly Dart[];
  readonly turns: readonly TurnRecord[];
  readonly status: "playing" | "complete";
  readonly winnerId?: string;
}
export interface X01State extends X01Snapshot {
  readonly options: X01Options;
  readonly players: readonly X01Player[];
  readonly past: readonly X01Snapshot[];
}

export function createX01(options: X01Options, players: readonly X01Player[]): X01State {
  validateOptions(options);
  if (players.length < 1 || players.some((player) => !player.id || !player.name)) throw new Error("At least one named player is required");
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error("Player ids must be unique");
  const scores = players.map(() => options.startingScore);
  return freeze({ options: { ...options }, players: players.map((player) => ({ ...player })), scores, opened: players.map(() => options.inRule === "straight"), legs: players.map(() => 0), sets: players.map(() => 0), legNumber: 1, currentPlayer: 0, legStarter: 0, turnStartScore: options.startingScore, currentDarts: [], turns: [], past: [], status: "playing" });
}

export function applyDart(state: X01State, value: Dart): X01State {
  if (state.status === "complete") throw new Error("The match is complete");
  const before = snapshot(state);
  const player = state.currentPlayer;
  const darts = [...state.currentDarts, value];
  let opened = state.opened[player] ?? false;
  const scores = [...state.scores];
  if (!opened && qualifiesIn(value, state.options.inRule)) opened = true;
  if (opened) scores[player] = (scores[player] ?? 0) - value.score;
  const remaining = scores[player] ?? 0;
  const bust = remaining < 0 || (remaining === 1 && state.options.outRule !== "straight") || (remaining === 0 && !qualifiesOut(value, state.options.outRule));
  if (bust) return advance(state, before, dartTurn(state, darts, state.turnStartScore, true), state.opened);
  const nextOpened = state.opened.map((value, index) => index === player ? opened : value);
  if (remaining === 0) return winLeg(state, before, scores, nextOpened, dartTurn(state, darts, 0, false));
  if (darts.length === 3) return advance({ ...state, scores, opened: nextOpened }, before, dartTurn(state, darts, remaining, false), nextOpened);
  return freeze({ ...state, scores, opened: nextOpened, currentDarts: darts, past: [...state.past, before] });
}

export function applyAggregateVisit(state: X01State, visit: AggregateVisitInput): X01State {
  if (state.status === "complete") throw new Error("The match is complete");
  validateAggregateVisit(visit);
  if (state.currentDarts.length > 0) throw new AggregateVisitRequiresDartsError("mixed-entry");
  const player = state.currentPlayer;
  if (!(state.opened[player] ?? false) && state.options.inRule !== "straight") throw new AggregateVisitRequiresDartsError("in-rule");

  const before = snapshot(state);
  const scoreBefore = state.turnStartScore;
  const remaining = scoreBefore - visit.score;
  const bust = remaining < 0 || (remaining === 1 && state.options.outRule !== "straight");
  if (remaining === 0 && state.options.outRule !== "straight") throw new AggregateVisitRequiresDartsError("out-rule");
  if (!bust && remaining > 0 && visit.dartsThrown !== 3) throw new RangeError("A non-finishing aggregate visit must contain three darts");
  const turn = aggregateTurn(state, visit, bust ? scoreBefore : remaining, bust);
  if (bust) return advance(state, before, turn, state.opened);
  const scores = state.scores.map((score, index) => index === player ? remaining : score);
  if (remaining === 0) return winLeg(state, before, scores, state.opened, turn);
  return advance({ ...state, scores }, before, turn, state.opened);
}

export function undoLastDart(state: X01State): X01State {
  const previous = state.past.at(-1);
  if (!previous) return state;
  const stateWithoutWinner = { ...state };
  delete stateWithoutWinner.winnerId;
  return freeze({ ...stateWithoutWinner, ...previous, past: state.past.slice(0, -1) });
}

export function x01PlayerStats(state: X01State, playerId: string): X01PlayerStats {
  if (!state.players.some((player) => player.id === playerId)) throw new Error(`Unknown X01 player: ${playerId}`);
  const completed = state.turns.filter((turn) => turn.playerId === playerId);
  let pointsScored = completed.reduce((total, turn) => total + turn.scoreBefore - turn.scoreAfter, 0);
  let dartsThrown = completed.reduce((total, turn) => total + turn.dartsThrown, 0);
  let visits = completed.length;
  const currentIndex = state.players.findIndex((player) => player.id === playerId);
  if (state.status === "playing" && state.currentPlayer === currentIndex && state.currentDarts.length > 0) {
    pointsScored += state.turnStartScore - state.scores[currentIndex]!;
    dartsThrown += state.currentDarts.length;
    visits += 1;
  }
  return { playerId, pointsScored, dartsThrown, visits, threeDartAverage: dartsThrown === 0 ? 0 : pointsScored * 3 / dartsThrown };
}

function advance(state: X01State, before: X01Snapshot, turn: TurnRecord, opened: readonly boolean[]): X01State {
  const scores = turn.bust ? state.scores.map((score, index) => index === state.currentPlayer ? state.turnStartScore : score) : state.scores;
  const currentPlayer = (state.currentPlayer + 1) % state.players.length;
  return freeze({ ...state, scores, opened, turns: [...state.turns, turn], currentPlayer, turnStartScore: scores[currentPlayer]!, currentDarts: [], past: [...state.past, before] });
}

function winLeg(state: X01State, before: X01Snapshot, scores: readonly number[], opened: readonly boolean[], turn: TurnRecord): X01State {
  const player = state.currentPlayer;
  const turns = [...state.turns, turn];
  const legs = [...state.legs];
  legs[player] = (legs[player] ?? 0) + 1;
  const sets = [...state.sets];
  const setWon = legs[player]! >= state.options.legsToWin;
  if (setWon) sets[player] = (sets[player] ?? 0) + 1;
  if (setWon && sets[player]! >= state.options.setsToWin) {
    return freeze({ ...state, scores, opened, legs, sets, turns, currentDarts: [], status: "complete", winnerId: state.players[player]!.id, past: [...state.past, before] });
  }
  if (setWon) legs.fill(0);
  const resetScores = state.players.map(() => state.options.startingScore);
  const starter = (state.legStarter + 1) % state.players.length;
  return freeze({ ...state, scores: resetScores, opened: state.players.map(() => state.options.inRule === "straight"), legs, sets, legNumber: state.legNumber + 1, turns, currentPlayer: starter, legStarter: starter, turnStartScore: state.options.startingScore, currentDarts: [], past: [...state.past, before] });
}

function dartTurn(state: X01State, darts: readonly Dart[], scoreAfter: number, bust: boolean): TurnRecord {
  return { playerId: state.players[state.currentPlayer]!.id, legNumber: state.legNumber, source: "darts", darts, dartsThrown: darts.length as 1 | 2 | 3, scoreBefore: state.turnStartScore, scoreAfter, bust };
}

function aggregateTurn(state: X01State, visit: AggregateVisitInput, scoreAfter: number, bust: boolean): TurnRecord {
  return { playerId: state.players[state.currentPlayer]!.id, legNumber: state.legNumber, source: "aggregate", darts: [], dartsThrown: visit.dartsThrown, aggregateScore: visit.score, scoreBefore: state.turnStartScore, scoreAfter, bust };
}

function qualifiesIn(value: Dart, rule: InRule) { return rule === "straight" || value.multiplier === 2 || (rule === "master" && value.multiplier === 3); }
function qualifiesOut(value: Dart, rule: OutRule) { return rule === "straight" || value.multiplier === 2 || (rule === "master" && value.multiplier === 3); }
function snapshot(state: X01State): X01Snapshot {
  return { scores: state.scores, opened: state.opened, legs: state.legs, sets: state.sets, legNumber: state.legNumber, currentPlayer: state.currentPlayer, legStarter: state.legStarter, turnStartScore: state.turnStartScore, currentDarts: state.currentDarts, turns: state.turns, status: state.status, ...(state.winnerId ? { winnerId: state.winnerId } : {}) };
}
function freeze<T>(value: T): T { return Object.freeze(value); }

function validateAggregateVisit(visit: AggregateVisitInput) {
  if (!Number.isInteger(visit.dartsThrown) || visit.dartsThrown < 1 || visit.dartsThrown > 3) throw new RangeError("Darts thrown must be 1, 2, or 3");
  if (!Number.isInteger(visit.score) || visit.score < 0 || visit.score > visit.dartsThrown * 60 || !aggregateScoreExists(visit.score, visit.dartsThrown)) throw new RangeError("Aggregate score cannot be made with the declared darts");
}

function aggregateScoreExists(score: number, dartsThrown: number): boolean {
  const dartScores = [0, 25, 50, ...Array.from({ length: 20 }, (_, index) => index + 1), ...Array.from({ length: 20 }, (_, index) => (index + 1) * 2), ...Array.from({ length: 20 }, (_, index) => (index + 1) * 3)];
  let totals = new Set([0]);
  for (let dartIndex = 0; dartIndex < dartsThrown; dartIndex += 1) totals = new Set([...totals].flatMap((total) => dartScores.map((dartScore) => total + dartScore)));
  return totals.has(score);
}

function validateOptions(options: X01Options) {
  if (!Number.isInteger(options.startingScore) || options.startingScore < 2 || options.startingScore > 9999) throw new Error("Starting score must be an integer from 2 to 9999");
  if (!Number.isInteger(options.legsToWin) || options.legsToWin < 1 || !Number.isInteger(options.setsToWin) || options.setsToWin < 1) throw new Error("Legs and sets must be positive integers");
}
