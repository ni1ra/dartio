import type { Dart } from "./darts";

/**
 * The round-based modes: Around the Clock, Shanghai, Count-Up, and Bob's 27.
 *
 * They share one skeleton — a fixed or open sequence of rounds, three darts per
 * visit, a target that depends on the round — and differ only in how a visit
 * scores and when the game ends. That difference is a `RoundRules` object, so
 * adding the fifth of these is a table entry rather than a new reducer.
 *
 * Nothing here imports X01 or Cricket. Like them, state is immutable and the
 * reducer is pure, so the same event log, rewind, and resume machinery applies.
 */
export type RoundModeId = "aroundTheClock" | "shanghai" | "countUp" | "bobs27";

export interface RoundPlayer { readonly id: string; readonly name: string }

export interface RoundVisit {
  readonly playerId: string;
  readonly round: number;
  readonly target: number | null;
  readonly darts: readonly Dart[];
  readonly scored: number;
  /** Set when this visit ended the game for its player. */
  readonly outcome?: "won" | "eliminated";
}

export interface RoundState {
  readonly mode: RoundModeId;
  readonly players: readonly RoundPlayer[];
  readonly totals: readonly number[];
  /** Around the Clock only: the target index each player has reached. */
  readonly progress: readonly number[];
  readonly currentPlayer: number;
  readonly currentDarts: readonly Dart[];
  readonly round: number;
  readonly visits: readonly RoundVisit[];
  readonly status: "playing" | "complete";
  readonly winnerId?: string;
}

interface RoundRules {
  readonly name: string;
  /** Null means the mode runs until a player finishes rather than to a count. */
  readonly rounds: number | null;
  readonly startingTotal: number;
  /** The bed a player is aiming at this visit, or null when anything counts. */
  target(state: RoundState, player: number): number | null;
  /** Points a completed visit adds. May be negative. */
  score(state: RoundState, player: number, darts: readonly Dart[]): number;
  /** True when this visit wins outright, before the round count runs out. */
  wins?(state: RoundState, player: number, darts: readonly Dart[]): boolean;
  /** True when the player is out of the game entirely. */
  eliminated?(total: number): boolean;
  /** Highest total wins unless a mode says otherwise. */
  readonly lowWins?: boolean;
}

const CLOCK_TARGETS = [...Array.from({ length: 20 }, (_, index) => index + 1), 25] as const;

function hitsOn(darts: readonly Dart[], target: number): readonly Dart[] {
  return darts.filter((value) => value.segment === target);
}

export const ROUND_MODES: Readonly<Record<RoundModeId, RoundRules>> = {
  /**
   * Around the Clock — 1 through 20 then the bull, one target at a time. Any
   * bed on the target advances; the visit can advance more than once.
   */
  aroundTheClock: {
    name: "Around the Clock",
    rounds: null,
    startingTotal: 0,
    target: (state, player) => CLOCK_TARGETS[state.progress[player] ?? 0] ?? null,
    score: (state, player, darts) => {
      let index = state.progress[player] ?? 0;
      let advanced = 0;
      for (const value of darts) {
        if (value.segment === CLOCK_TARGETS[index]) {
          index += 1;
          advanced += 1;
          if (index >= CLOCK_TARGETS.length) break;
        }
      }
      return advanced;
    },
    wins: (state, player, darts) => {
      let index = state.progress[player] ?? 0;
      for (const value of darts) {
        if (value.segment === CLOCK_TARGETS[index]) index += 1;
        if (index >= CLOCK_TARGETS.length) return true;
      }
      return false;
    },
  },

  /**
   * Shanghai — round N targets number N. Singles, doubles, and trebles all
   * score their face value. Hitting all three in one visit wins on the spot.
   */
  shanghai: {
    name: "Shanghai",
    rounds: 20,
    startingTotal: 0,
    target: (state) => state.round,
    score: (state, _player, darts) =>
      hitsOn(darts, state.round).reduce((total, value) => total + value.score, 0),
    wins: (state, _player, darts) => {
      const multipliers = new Set(hitsOn(darts, state.round).map((value) => value.multiplier));
      return multipliers.has(1) && multipliers.has(2) && multipliers.has(3);
    },
  },

  /** Count-Up — eight rounds, everything counts, highest total takes it. */
  countUp: {
    name: "Count-Up",
    rounds: 8,
    startingTotal: 0,
    target: () => null,
    score: (_state, _player, darts) => darts.reduce((total, value) => total + value.score, 0),
  },

  /**
   * Bob's 27 — start on 27 and work the doubles from 1 to 20. Each hit adds
   * twice the number; a visit that misses all three subtracts it. Below zero is
   * out.
   */
  bobs27: {
    name: "Bob's 27",
    rounds: 20,
    startingTotal: 27,
    target: (state) => state.round,
    score: (state, _player, darts) => {
      const hits = darts.filter((value) => value.segment === state.round && value.multiplier === 2).length;
      return hits > 0 ? hits * state.round * 2 : -(state.round * 2);
    },
    eliminated: (total) => total < 0,
  },
};

export function createRoundMatch(mode: RoundModeId, players: readonly RoundPlayer[]): RoundState {
  const rules = ROUND_MODES[mode];
  if (!rules) throw new Error(`Unknown round mode: ${mode}`);
  if (players.length < 1 || players.some((player) => !player.id || !player.name)) {
    throw new Error("At least one named player is required");
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new Error("Player ids must be unique");
  }
  return Object.freeze({
    mode,
    players: players.map((player) => ({ ...player })),
    totals: players.map(() => rules.startingTotal),
    progress: players.map(() => 0),
    currentPlayer: 0,
    currentDarts: [],
    round: 1,
    visits: [],
    status: "playing",
  });
}

export function roundTarget(state: RoundState): number | null {
  return ROUND_MODES[state.mode].target(state, state.currentPlayer);
}

export function applyRoundDart(state: RoundState, value: Dart): RoundState {
  if (state.status === "complete") throw new Error("The match is complete");
  const darts = [...state.currentDarts, value];
  const rules = ROUND_MODES[state.mode];
  const player = state.currentPlayer;

  // An instant win is checked mid-visit so a Shanghai or a finished clock does
  // not have to wait for the third dart to land.
  if (rules.wins?.(state, player, darts)) {
    return settle(state, darts, rules.score(state, player, darts), "won");
  }
  if (darts.length < 3) return Object.freeze({ ...state, currentDarts: darts });
  return settle(state, darts, rules.score(state, player, darts), null);
}

function settle(state: RoundState, darts: readonly Dart[], scored: number, outcome: "won" | null): RoundState {
  const rules = ROUND_MODES[state.mode];
  const player = state.currentPlayer;
  const totals = [...state.totals];
  const progress = [...state.progress];

  if (state.mode === "aroundTheClock") {
    progress[player] = Math.min((progress[player] ?? 0) + scored, CLOCK_TARGETS.length);
    totals[player] = progress[player]!;
  } else {
    totals[player] = (totals[player] ?? 0) + scored;
  }

  const knockedOut = rules.eliminated?.(totals[player] ?? 0) ?? false;
  const visit: RoundVisit = {
    playerId: state.players[player]!.id,
    round: state.round,
    target: rules.target(state, player),
    darts,
    scored,
    ...(outcome ? { outcome } : knockedOut ? { outcome: "eliminated" as const } : {}),
  };
  const visits = [...state.visits, visit];

  if (outcome === "won") {
    return Object.freeze({ ...state, totals, progress, visits, currentDarts: [], status: "complete", winnerId: state.players[player]!.id });
  }

  const currentPlayer = (player + 1) % state.players.length;
  const round = currentPlayer === 0 ? state.round + 1 : state.round;
  const settled: RoundState = { ...state, totals, progress, visits, currentPlayer, currentDarts: [], round };

  const outOfRounds = rules.rounds !== null && currentPlayer === 0 && round > rules.rounds;
  const everyoneOut = state.players.every((_, index) => rules.eliminated?.(totals[index] ?? 0) ?? false);
  if (outOfRounds || everyoneOut) {
    const leader = decide(settled, rules);
    return Object.freeze({ ...settled, status: "complete", ...(leader === null ? {} : { winnerId: state.players[leader]!.id }) });
  }
  return Object.freeze(settled);
}

/** Highest total, or lowest where the mode says so. A tie names no winner. */
function decide(state: RoundState, rules: RoundRules): number | null {
  const ranked = state.players
    .map((_, index) => ({ index, total: state.totals[index] ?? 0 }))
    .sort((a, b) => (rules.lowWins ? a.total - b.total : b.total - a.total));
  const [first, second] = ranked;
  if (!first) return null;
  if (second && second.total === first.total) return null;
  return first.index;
}

/**
 * What the scoreboard should show right now, including the darts in hand.
 *
 * The reducer only banks a visit when it settles, which is correct — a visit is
 * the unit these modes score in. But a player mid-visit needs to see the target
 * move as they hit it, and their total climb as they throw. This projects the
 * in-progress visit without committing it.
 *
 * Bob's 27 is the exception: its penalty only applies to a visit that misses
 * every double, and showing that deduction after the first dart would be a lie
 * about a visit the player can still save.
 */
export function liveRoundView(state: RoundState): { readonly target: number | null; readonly totals: readonly number[] } {
  const rules = ROUND_MODES[state.mode];
  if (state.status === "complete" || state.currentDarts.length === 0) {
    return { target: rules.target(state, state.currentPlayer), totals: state.totals };
  }

  const player = state.currentPlayer;
  const pending = rules.score(state, player, state.currentDarts);

  if (state.mode === "aroundTheClock") {
    const index = Math.min((state.progress[player] ?? 0) + pending, CLOCK_TARGETS.length);
    return {
      target: CLOCK_TARGETS[index] ?? null,
      totals: state.totals.map((total, seat) => (seat === player ? index : total)),
    };
  }

  const projected = pending < 0 ? 0 : pending;
  return {
    target: rules.target(state, player),
    totals: state.totals.map((total, seat) => (seat === player ? total + projected : total)),
  };
}
