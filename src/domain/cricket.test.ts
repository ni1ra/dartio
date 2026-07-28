import { describe, expect, it } from "vitest";
import {
  applyCricketDart,
  appendCricketEvent,
  createCricket,
  createCricketLog,
  cricketDartEvent,
  cricketPlayerStats,
  dart,
  hasClosed,
  replayCricket,
  rewindCricketToVisit,
  undoLastCricketEvent,
  type CricketOptions,
  type CricketState,
  type Dart,
} from "@/domain";

const PLAYERS = [{ id: "a", name: "Ada" }, { id: "b", name: "Bo" }] as const;
const standard: CricketOptions = { variant: "standard", winByTwo: false, roundLimit: null };

const play = (state: CricketState, ...darts: readonly Dart[]) =>
  darts.reduce((current, value) => applyCricketDart(current, value), state);

/** Three darts that score nothing, to hand the visit over. */
const blank = () => [dart(1), dart(1), dart(1)] as const;

describe("Cricket marks", () => {
  it("closes a number with three marks and counts a treble as three", () => {
    const state = play(createCricket(standard, [...PLAYERS]), dart(20, 3));
    expect(hasClosed(state, 0, 20)).toBe(true);
    expect(state.points[0]).toBe(0);
  });

  it("counts a double bull as two marks and an outer bull as one", () => {
    let state = play(createCricket(standard, [...PLAYERS]), dart(25, 2));
    expect(state.marks[0]![6]).toBe(2);
    state = applyCricketDart(state, dart(25));
    expect(hasClosed(state, 0, 25)).toBe(true);
  });

  it("ignores darts that are not scoring numbers", () => {
    const state = play(createCricket(standard, [...PLAYERS]), dart(14, 3), dart(0));
    expect(state.marks[0]!.every((value) => value === 0)).toBe(true);
    expect(state.currentDarts).toHaveLength(2);
  });

  it("never banks more marks than the number still needed", () => {
    // T20 closes it; a second T20 is three marks of overflow, worth 60 points,
    // not six marks of closing.
    const state = play(createCricket(standard, [...PLAYERS]), dart(20, 3), dart(20, 3));
    expect(state.marks[0]![0]).toBe(3);
    expect(state.points[0]).toBe(60);
  });
});

describe("Cricket scoring by variant", () => {
  it("standard: overflow scores for the closer while the opponent is open", () => {
    const state = play(createCricket(standard, [...PLAYERS]), dart(20, 3), dart(20, 2));
    expect(state.points[0]).toBe(40);
    expect(state.points[1]).toBe(0);
  });

  it("standard: a number both players have closed scores nothing", () => {
    let state = play(createCricket(standard, [...PLAYERS]), dart(20, 3), dart(1), dart(1));
    state = play(state, dart(20, 3), dart(1), dart(1));
    state = play(state, dart(20, 3));
    expect(state.points[0]).toBe(0);
  });

  it("cut-throat: overflow is inflicted on every open opponent, and low wins", () => {
    const cutThroat: CricketOptions = { variant: "cut-throat", winByTwo: false, roundLimit: null };
    const state = play(createCricket(cutThroat, [...PLAYERS]), dart(20, 3), dart(20, 3));
    expect(state.points[0]).toBe(0);
    expect(state.points[1]).toBe(60);
  });

  it("tactics: no number ever scores a point", () => {
    const tactics: CricketOptions = { variant: "tactics", winByTwo: false, roundLimit: null };
    const state = play(createCricket(tactics, [...PLAYERS]), dart(20, 3), dart(20, 3), dart(20, 3));
    expect(state.points).toEqual([0, 0]);
    expect(hasClosed(state, 0, 20)).toBe(true);
  });
});

describe("Cricket win conditions", () => {
  /** Closes every number for the player whose visit it is. */
  function closeEverything(state: CricketState): CricketState {
    let current = state;
    for (const target of [20, 19, 18, 17, 16, 15] as const) {
      current = play(current, dart(target, 3), dart(1), dart(1));
      if (current.status === "complete") return current;
      current = play(current, ...blank());
    }
    return play(current, dart(25, 2), dart(25));
  }

  it("tactics is won by closing everything, points irrelevant", () => {
    const tactics: CricketOptions = { variant: "tactics", winByTwo: false, roundLimit: null };
    const state = closeEverything(createCricket(tactics, [...PLAYERS]));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });

  it("standard is won by closing everything while not behind on points", () => {
    const state = closeEverything(createCricket(standard, [...PLAYERS]));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });

  it("winByTwo refuses a win that is only level on points", () => {
    const strict: CricketOptions = { variant: "tactics", winByTwo: true, roundLimit: null };
    // Tactics ignores points entirely, so winByTwo cannot block it.
    expect(closeEverything(createCricket(strict, [...PLAYERS])).status).toBe("complete");

    const levelled: CricketOptions = { variant: "standard", winByTwo: true, roundLimit: null };
    const state = closeEverything(createCricket(levelled, [...PLAYERS]));
    // Ada closed everything with zero points and Bo also has zero: level, so
    // the strict rule keeps the match alive.
    expect(state.status).toBe("playing");
  });

  it("a round limit ends the match and awards it on marks", () => {
    const capped: CricketOptions = { variant: "standard", winByTwo: false, roundLimit: 1 };
    let state = createCricket(capped, [...PLAYERS]);
    state = play(state, dart(20, 3), dart(19, 3), dart(18, 3)); // Ada: 9 marks
    expect(state.status).toBe("playing");
    state = play(state, ...blank()); // Bo: nothing
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });
});

describe("Cricket statistics and log", () => {
  it("reports marks per round from darts actually thrown", () => {
    const state = play(createCricket(standard, [...PLAYERS]), dart(20, 3), dart(19, 3), dart(18, 3));
    const stats = cricketPlayerStats(state, "a");
    expect(stats.marks).toBe(9);
    expect(stats.dartsThrown).toBe(3);
    expect(stats.marksPerRound).toBeCloseTo(9, 6);
    expect(stats.closed).toEqual([20, 19, 18]);
  });

  it("records the whole visit's marks and points, not just the last dart", () => {
    const state = play(createCricket(standard, [...PLAYERS]), dart(20, 3), dart(20, 3), dart(19, 3));
    expect(state.turns).toHaveLength(1);
    // 20 closed (3 marks), a second T20 overflowing for 60, then 19 closed (3).
    expect(state.turns[0]).toMatchObject({ marksScored: 6, pointsScored: 60, dartsThrown: 3 });
  });

  it("replays a log deterministically and rewinds to a visit", () => {
    let log = createCricketLog(standard, [...PLAYERS]);
    for (const value of [dart(20, 3), dart(20, 3), dart(19, 3), dart(1), dart(1), dart(1), dart(18, 3)]) {
      log = appendCricketEvent(log, cricketDartEvent(value));
    }
    const first = replayCricket(log);
    expect(first.rejected).toEqual([]);
    expect(replayCricket(log).state.points).toEqual(first.state.points);

    // Rewinding to visit 1 keeps Ada's opening visit and drops everything after.
    const rewound = rewindCricketToVisit(log, 1);
    expect(rewound.events).toHaveLength(3);
    expect(replayCricket(rewound).state.turns).toHaveLength(1);

    expect(undoLastCricketEvent(log).events).toHaveLength(6);
    expect(() => rewindCricketToVisit(log, 9)).toThrow("No completed visit at index 9");
  });
});

describe("Cricket setup validation", () => {
  it("refuses a solo match, duplicate ids, and an impossible round limit", () => {
    expect(() => createCricket(standard, [{ id: "a", name: "Ada" }])).toThrow("at least two named players");
    expect(() => createCricket(standard, [{ id: "a", name: "Ada" }, { id: "a", name: "Bo" }])).toThrow("unique");
    expect(() => createCricket({ ...standard, roundLimit: 0 }, [...PLAYERS])).toThrow("round limit");
  });
});
