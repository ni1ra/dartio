import { describe, expect, it } from "vitest";
import { applyRoundDart, createRoundMatch, dart, liveRoundView, roundTarget, type Dart, type RoundState } from "@/domain";

const SOLO = [{ id: "a", name: "Ada" }];
const PAIR = [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }];
const play = (state: RoundState, ...darts: readonly Dart[]) =>
  darts.reduce((current, value) => applyRoundDart(current, value), state);
const miss = () => [dart(0), dart(0), dart(0)] as const;

describe("Around the Clock", () => {
  it("advances on any bed of the current target", () => {
    let state = createRoundMatch("aroundTheClock", SOLO);
    expect(roundTarget(state)).toBe(1);
    state = play(state, dart(1, 3), dart(2), dart(5));
    // The treble one advanced to two, and the two advanced to three.
    expect(state.progress[0]).toBe(2);
    expect(roundTarget(state)).toBe(3);
  });

  it("finishes on the bull and wins mid-visit", () => {
    let state = createRoundMatch("aroundTheClock", SOLO);
    for (let target = 1; target <= 20; target += 1) state = play(state, dart(target as 1), dart(0), dart(0));
    expect(roundTarget(state)).toBe(25);
    state = applyRoundDart(state, dart(25));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });
});

describe("Shanghai", () => {
  it("scores only the round's number, at face value", () => {
    let state = createRoundMatch("shanghai", SOLO);
    state = play(state, dart(1, 3), dart(20, 3), dart(1));
    expect(state.totals[0]).toBe(4);
    expect(state.round).toBe(2);
    expect(roundTarget(state)).toBe(2);
  });

  it("a single, double, and treble in one visit wins outright", () => {
    let state = createRoundMatch("shanghai", SOLO);
    state = play(state, dart(1), dart(1, 2), dart(1, 3));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
    expect(state.visits.at(-1)?.outcome).toBe("won");
  });

  it("runs out of rounds and awards the highest total", () => {
    let state = createRoundMatch("shanghai", PAIR);
    for (let round = 1; round <= 20; round += 1) {
      state = play(state, dart(round as 1), dart(0), dart(0));
      if (state.status === "complete") break;
      state = play(state, ...miss());
      if (state.status === "complete") break;
    }
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });
});

describe("Count-Up", () => {
  it("counts every dart and ends after eight rounds", () => {
    let state = createRoundMatch("countUp", SOLO);
    expect(roundTarget(state)).toBeNull();
    for (let round = 1; round <= 8; round += 1) state = play(state, dart(20, 3), dart(20), dart(5));
    expect(state.totals[0]).toBe(8 * 85);
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });

  it("names no winner when two players finish level", () => {
    let state = createRoundMatch("countUp", PAIR);
    for (let round = 1; round <= 8; round += 1) {
      state = play(state, dart(20), dart(20), dart(20));
      state = play(state, dart(20), dart(20), dart(20));
    }
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBeUndefined();
  });
});

describe("Bob's 27", () => {
  it("starts on 27 and pays twice the number for each double", () => {
    let state = createRoundMatch("bobs27", SOLO);
    expect(state.totals[0]).toBe(27);
    state = play(state, dart(1, 2), dart(1, 2), dart(0));
    expect(state.totals[0]).toBe(27 + 4);
  });

  it("subtracts twice the number for a visit that misses every double", () => {
    let state = createRoundMatch("bobs27", SOLO);
    // Singles on the number do not count; only the double pays.
    state = play(state, dart(1), dart(1), dart(1));
    expect(state.totals[0]).toBe(25);
  });

  it("eliminates a player who drops below zero", () => {
    let state = createRoundMatch("bobs27", SOLO);
    // Miss every double until the running total goes negative.
    while (state.status === "playing") state = play(state, ...miss());
    expect(state.totals[0]).toBeLessThan(0);
    expect(state.status).toBe("complete");
    expect(state.visits.at(-1)?.outcome).toBe("eliminated");
  });
});

describe("Live scoreboard projection", () => {
  it("moves the Around the Clock target as the visit is thrown", () => {
    let state = createRoundMatch("aroundTheClock", SOLO);
    expect(liveRoundView(state).target).toBe(1);
    state = applyRoundDart(state, dart(1));
    // The visit has not settled, but the player is aiming at two now.
    expect(state.progress[0]).toBe(0);
    expect(liveRoundView(state).target).toBe(2);
    expect(liveRoundView(state).totals[0]).toBe(1);
  });

  it("climbs a Count-Up total as darts land", () => {
    let state = createRoundMatch("countUp", SOLO);
    state = applyRoundDart(state, dart(20, 3));
    expect(state.totals[0]).toBe(0);
    expect(liveRoundView(state).totals[0]).toBe(60);
  });

  it("never shows Bob's 27 penalty before the visit is over", () => {
    let state = createRoundMatch("bobs27", SOLO);
    state = applyRoundDart(state, dart(0));
    // The visit can still be saved by the next two darts.
    expect(liveRoundView(state).totals[0]).toBe(27);
    state = applyRoundDart(state, dart(0));
    state = applyRoundDart(state, dart(0));
    expect(liveRoundView(state).totals[0]).toBe(25);
  });
});

describe("Round mode setup", () => {
  it("refuses an unknown mode, duplicate ids, and an empty roster", () => {
    expect(() => createRoundMatch("nope" as "shanghai", SOLO)).toThrow("Unknown round mode");
    expect(() => createRoundMatch("shanghai", [])).toThrow("named player");
    expect(() => createRoundMatch("shanghai", [{ id: "a", name: "Ada" }, { id: "a", name: "Bo" }])).toThrow("unique");
  });

  it("refuses a dart once the match is complete", () => {
    let state = createRoundMatch("shanghai", SOLO);
    state = play(state, dart(1), dart(1, 2), dart(1, 3));
    expect(() => applyRoundDart(state, dart(5))).toThrow("The match is complete");
  });
});
