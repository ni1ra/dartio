import { describe, expect, it } from "vitest";
import {
  applyRoundDart,
  chooseCricketAim,
  chooseRoundAim,
  createCricket,
  createRoundMatch,
  CRICKET_NUMBERS,
  dart,
  type CricketOptions,
  type CricketState,
  type RoundState,
} from "@/domain";

const PLAYERS = [{ id: "you", name: "You" }, { id: "them", name: "Them" }] as const;
const STANDARD: CricketOptions = { variant: "standard", winByTwo: false, roundLimit: null };

/**
 * Closes numbers for one player by writing the marks directly.
 *
 * Playing them in would not work: a visit ends after three darts and hands the
 * board to the opponent, so a loop of darts closes numbers for alternating
 * players. These tests are about the chooser, not about turn order.
 */
function closed(state: CricketState, player: number, ...numbers: readonly number[]): CricketState {
  return {
    ...state,
    marks: state.marks.map((row, index) => index !== player
      ? row
      : row.map((marks, slot) => (numbers.includes(CRICKET_NUMBERS[slot]!) ? 3 : marks))),
  } as CricketState;
}

describe("a Cricket opponent", () => {
  const fresh = createCricket(STANDARD, PLAYERS);

  it("opens on the twenty at every level, because it is worth the most", () => {
    for (const tactics of ["novice", "competent", "expert"] as const) {
      expect(chooseCricketAim(fresh, 0, tactics)).toEqual({ segment: 20, multiplier: 3 });
    }
  });

  it("aims at the bull as a single, because its treble does not exist", () => {
    const state = closed(fresh, 0, 20, 19, 18, 17, 16, 15);
    expect(chooseCricketAim(state, 0, "novice")).toEqual({ segment: 25, multiplier: 1 });
  });

  it("makes a novice work the board in printed order and nothing else", () => {
    expect(chooseCricketAim(closed(fresh, 0, 20), 0, "novice")).toEqual({ segment: 19, multiplier: 3 });
  });

  it("makes an expert skip a number nobody can be scored on", () => {
    // Both players have shut the twenty and the nineteen, so neither can ever be
    // scored on again. An expert goes to the eighteen rather than down the list.
    const state = closed(closed(fresh, 0, 20, 19), 1, 20, 19);
    expect(chooseCricketAim(state, 0, "expert")).toEqual({ segment: 18, multiplier: 3 });
    // A novice does not notice, and works the printed order regardless.
    expect(chooseCricketAim(state, 0, "novice")).toEqual({ segment: 18, multiplier: 3 });
  });

  it("switches to scoring once it has closed everything", () => {
    const state = closed(fresh, 0, 20, 19, 18, 17, 16, 15, 25);
    expect(chooseCricketAim(state, 0, "expert")).toEqual({ segment: 20, multiplier: 3 });
  });

  it("has nothing to score on in tactics, where points do not exist", () => {
    const board = createCricket({ ...STANDARD, variant: "tactics" }, PLAYERS);
    const state = closed(board, 0, 20, 19, 18, 17, 16, 15, 25);
    expect(chooseCricketAim(state, 0, "expert")).toEqual({ segment: 20, multiplier: 3 });
  });
});

describe("a round-mode opponent", () => {
  it("aims at the treble twenty in Count-Up at every level, because that is the only right answer", () => {
    const state = createRoundMatch("countUp", PLAYERS);
    for (const tactics of ["novice", "competent", "expert"] as const) {
      expect(chooseRoundAim(state, 0, tactics)).toEqual({ segment: 20, multiplier: 3 });
    }
  });

  it("aims at the round's double in Bob's 27 at every level, for the same reason", () => {
    const state = createRoundMatch("bobs27", PLAYERS);
    for (const tactics of ["novice", "competent", "expert"] as const) {
      expect(chooseRoundAim(state, 0, tactics)).toMatchObject({ multiplier: 2 });
    }
  });

  it("sends a novice at the treble in Around the Clock and everyone better at the big single", () => {
    const state = createRoundMatch("aroundTheClock", PLAYERS);

    // Any bed on the target advances, so the treble buys nothing and costs area.
    expect(chooseRoundAim(state, 0, "novice")).toEqual({ segment: 1, multiplier: 3 });
    expect(chooseRoundAim(state, 0, "competent")).toEqual({ segment: 1, multiplier: 1 });
    expect(chooseRoundAim(state, 0, "expert")).toEqual({ segment: 1, multiplier: 1 });
  });

  it("moves the Around the Clock target after each exact landing in the visit", () => {
    let state = createRoundMatch("aroundTheClock", PLAYERS);
    expect(chooseRoundAim(state, 0, "expert")).toEqual({ segment: 1, multiplier: 1 });
    state = applyRoundDart(state, dart(1, 1));
    expect(chooseRoundAim(state, 0, "expert")).toEqual({ segment: 2, multiplier: 1 });
    state = applyRoundDart(state, dart(2, 1));
    expect(chooseRoundAim(state, 0, "expert")).toEqual({ segment: 3, multiplier: 1 });
  });

  it("plays an expert for the Shanghai and everyone else for points", () => {
    const state = createRoundMatch("shanghai", PLAYERS);

    expect(chooseRoundAim(state, 0, "competent")).toEqual({ segment: 1, multiplier: 3 });
    // Nothing taken yet: hardest first, while there are still darts to spare.
    expect(chooseRoundAim(state, 0, "expert", [])).toEqual({ segment: 1, multiplier: 3 });
    // Treble and double already in the visit, so the single is what completes it.
    const partial = [dart(1, 3), dart(1, 2)];
    expect(chooseRoundAim(state, 0, "expert", partial)).toEqual({ segment: 1, multiplier: 1 });
  });

  it("aims at the outer bull rather than a bull double when the clock reaches it", () => {
    // Progress written directly: a partial visit is not committed, so playing the
    // clock in would leave the state one target short of where it looks.
    const state = { ...createRoundMatch("aroundTheClock", [PLAYERS[0]]), progress: [20] } as RoundState;
    expect(chooseRoundAim(state, 0, "expert")).toEqual({ segment: 25, multiplier: 1 });
  });
});
