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
  readonly darts: readonly Dart[];
  readonly scoreBefore: number;
  readonly scoreAfter: number;
  readonly bust: boolean;
}
interface X01Snapshot {
  readonly scores: readonly number[];
  readonly opened: readonly boolean[];
  readonly legs: readonly number[];
  readonly sets: readonly number[];
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
  if (players.length < 1 || players.some((p) => !p.id || !p.name)) throw new Error("At least one named player is required");
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error("Player ids must be unique");
  const scores = players.map(() => options.startingScore);
  return freeze({ options: { ...options }, players: players.map((p) => ({ ...p })), scores, opened: players.map(() => options.inRule === "straight"), legs: players.map(() => 0), sets: players.map(() => 0), currentPlayer: 0, legStarter: 0, turnStartScore: options.startingScore, currentDarts: [], turns: [], past: [], status: "playing" });
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
  if (bust) return advance(state, before, darts, state.turnStartScore, true, state.opened);
  const nextOpened = state.opened.map((v, i) => i === player ? opened : v);
  if (remaining === 0) return winLeg(state, before, darts, scores, nextOpened);
  if (darts.length === 3) return advance({ ...state, scores, opened: nextOpened }, before, darts, remaining, false, nextOpened);
  return freeze({ ...state, scores, opened: nextOpened, currentDarts: darts, past: [...state.past, before] });
}

export function undoLastDart(state: X01State): X01State {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return freeze({ ...state, ...previous, past: state.past.slice(0, -1) });
}

function advance(state: X01State, before: X01Snapshot, darts: readonly Dart[], scoreAfter: number, bust: boolean, opened: readonly boolean[]): X01State {
  const scores = bust ? state.scores.map((s, i) => i === state.currentPlayer ? state.turnStartScore : s) : state.scores;
  const turns = [...state.turns, { playerId: state.players[state.currentPlayer]!.id, darts, scoreBefore: state.turnStartScore, scoreAfter: bust ? state.turnStartScore : scoreAfter, bust }];
  const currentPlayer = (state.currentPlayer + 1) % state.players.length;
  return freeze({ ...state, scores, opened, turns, currentPlayer, turnStartScore: scores[currentPlayer]!, currentDarts: [], past: [...state.past, before] });
}

function winLeg(state: X01State, before: X01Snapshot, darts: readonly Dart[], scores: readonly number[], opened: readonly boolean[]): X01State {
  const p = state.currentPlayer;
  const turns = [...state.turns, { playerId: state.players[p]!.id, darts, scoreBefore: state.turnStartScore, scoreAfter: 0, bust: false }];
  const legs = [...state.legs]; legs[p] = (legs[p] ?? 0) + 1;
  const sets = [...state.sets];
  if (legs[p]! >= state.options.legsToWin) { sets[p] = (sets[p] ?? 0) + 1; legs.fill(0); }
  if (sets[p]! >= state.options.setsToWin) return freeze({ ...state, scores, opened, legs, sets, turns, currentDarts: [], status: "complete", winnerId: state.players[p]!.id, past: [...state.past, before] });
  const resetScores = state.players.map(() => state.options.startingScore);
  const starter = (state.legStarter + 1) % state.players.length;
  return freeze({ ...state, scores: resetScores, opened: state.players.map(() => state.options.inRule === "straight"), legs, sets, turns, currentPlayer: starter, legStarter: starter, turnStartScore: state.options.startingScore, currentDarts: [], past: [...state.past, before] });
}

function qualifiesIn(d: Dart, rule: InRule) { return rule === "straight" || d.multiplier === 2 || (rule === "master" && d.multiplier === 3); }
function qualifiesOut(d: Dart, rule: OutRule) { return rule === "straight" || d.multiplier === 2 || (rule === "master" && d.multiplier === 3); }
function snapshot(s: X01State): X01Snapshot {
  return { scores: s.scores, opened: s.opened, legs: s.legs, sets: s.sets, currentPlayer: s.currentPlayer, legStarter: s.legStarter, turnStartScore: s.turnStartScore, currentDarts: s.currentDarts, turns: s.turns, status: s.status, ...(s.winnerId ? { winnerId: s.winnerId } : {}) };
}
function freeze<T>(value: T): T { return Object.freeze(value); }
function validateOptions(o: X01Options) {
  if (!Number.isInteger(o.startingScore) || o.startingScore < 2 || o.startingScore > 9999) throw new Error("Starting score must be an integer from 2 to 9999");
  if (!Number.isInteger(o.legsToWin) || o.legsToWin < 1 || !Number.isInteger(o.setsToWin) || o.setsToWin < 1) throw new Error("Legs and sets must be positive integers");
}
