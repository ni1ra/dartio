import { describe, expect, it } from "vitest";
import {
  AggregateVisitRequiresDartsError,
  applyAggregateVisit,
  applyDart,
  createX01,
  dart,
  undoLastDart,
  x01PlayerStats,
} from "@/domain";

const players = [{ id: "a", name: "Ada" }, { id: "b", name: "Bert" }];
const options = { startingScore: 301, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" } as const;

describe("X01", () => {
  it("applies three darts immutably then advances", () => {
    const start = createX01(options, players);
    const one = applyDart(start, dart(20, 3));
    const two = applyDart(one, dart(20, 3));
    const three = applyDart(two, dart(20, 3));
    expect(start.scores[0]).toBe(301);
    expect(three.scores[0]).toBe(121);
    expect(three.currentPlayer).toBe(1);
    expect(three.turns[0]?.darts).toHaveLength(3);
  });

  it("rolls a bust back to the start of the turn", () => {
    let state = createX01({ ...options, startingScore: 40 }, players);
    state = applyDart(state, dart(20));
    state = applyDart(state, dart(19));
    expect(state.scores[0]).toBe(40);
    expect(state.currentPlayer).toBe(1);
    expect(state.turns[0]?.bust).toBe(true);
  });

  it("requires double-in and double-out", () => {
    let state = createX01({ ...options, startingScore: 40, inRule: "double" }, players);
    state = applyDart(state, dart(20));
    expect(state.scores[0]).toBe(40);
    state = applyDart(state, dart(10, 2));
    expect(state.scores[0]).toBe(20);
    state = applyDart(state, dart(10, 2));
    expect(state.status).toBe("complete");
    expect(state.winnerId).toBe("a");
  });

  it("undoes exactly one dart including a completed match", () => {
    const start = createX01({ ...options, startingScore: 40 }, players);
    const complete = applyDart(start, dart(20, 2));
    const restored = undoLastDart(complete);
    expect(restored.status).toBe("playing");
    expect(restored.scores[0]).toBe(40);
    expect(restored.past).toHaveLength(0);
  });

  it("allows one remaining and S1 under straight-out rules", () => {
    let state = createX01({ ...options, startingScore: 2, outRule: "straight" }, players);
    state = applyDart(state, dart(1));
    expect(state.scores[0]).toBe(1);
    state = applyDart(state, dart(1));
    expect(state.status).toBe("complete");
  });
  it("rotates the next leg from the prior starter, not the winner", () => {
    const three = [...players, { id: "c", name: "Cora" }];
    let state = createX01({ ...options, startingScore: 2, legsToWin: 3 }, three);
    for (let turn = 0; turn < 2; turn++) for (let throwIndex = 0; throwIndex < 3; throwIndex++) state = applyDart(state, dart(0));
    expect(state.currentPlayer).toBe(2);
    state = applyDart(state, dart(1, 2));
    expect(state.status).toBe("playing");
    expect(state.currentPlayer).toBe(1);
    expect(state.legStarter).toBe(1);
  });
});

describe("X01 match continuity", () => {
  it("preserves the decisive final leg and final scores instead of reporting 0-0", () => {
    let state = createX01(
      { ...options, startingScore: 2, legsToWin: 2 },
      players,
    );

    state = applyDart(state, dart(1, 2));
    expect(state).toMatchObject({
      status: "playing",
      legNumber: 2,
      legs: [1, 0],
      scores: [2, 2],
      currentPlayer: 1,
    });

    for (let throwIndex = 0; throwIndex < 3; throwIndex++) {
      state = applyDart(state, dart(0));
    }
    state = applyDart(state, dart(1, 2));

    expect(state).toMatchObject({
      status: "complete",
      winnerId: "a",
      legNumber: 2,
      legs: [2, 0],
      sets: [1, 0],
      scores: [0, 2],
    });
  });

  it("increments the global leg number across set transitions", () => {
    let state = createX01(
      { ...options, startingScore: 2, legsToWin: 1, setsToWin: 2 },
      players,
    );

    state = applyDart(state, dart(1, 2));
    expect(state).toMatchObject({
      status: "playing",
      legNumber: 2,
      legs: [0, 0],
      sets: [1, 0],
      currentPlayer: 1,
    });

    for (let throwIndex = 0; throwIndex < 3; throwIndex++) {
      state = applyDart(state, dart(0));
    }
    state = applyDart(state, dart(1, 2));

    expect(state).toMatchObject({
      status: "complete",
      legNumber: 2,
      legs: [1, 0],
      sets: [2, 0],
    });
  });

  it("undo restores leg progress and scores after a completed match", () => {
    let state = createX01(
      { ...options, startingScore: 2, legsToWin: 2 },
      players,
    );
    state = applyDart(state, dart(1, 2));
    for (let throwIndex = 0; throwIndex < 3; throwIndex++) {
      state = applyDart(state, dart(0));
    }
    state = applyDart(state, dart(1, 2));

    const restored = undoLastDart(state);
    expect(restored).toMatchObject({
      status: "playing",
      legNumber: 2,
      legs: [1, 0],
      scores: [2, 2],
      currentPlayer: 0,
    });
    expect(restored).not.toHaveProperty("winnerId");
    expect(restored.currentDarts).toHaveLength(0);
  });
});

describe("X01 regulation statistics", () => {
  it("counts bust darts and a one-dart finish in the three-dart average", () => {
    const solo = [{ id: "a", name: "Ada" }];
    let state = createX01({ ...options, startingScore: 40 }, solo);

    state = applyDart(state, dart(20));
    state = applyDart(state, dart(19));
    state = applyDart(state, dart(20, 2));

    // The bust visit scored nothing but still cost two darts, and the finish
    // that followed took one. Both count toward the regulation average.
    expect(x01PlayerStats(state, "a")).toMatchObject({
      playerId: "a",
      pointsScored: 40,
      dartsThrown: 3,
      visits: 2,
      bustCount: 1,
      bestVisit: 40,
      checkoutAttempts: 2,
      checkoutsHit: 1,
      legsWon: 1,
      threeDartAverage: 40,
    });
  });

  it("includes an active partial visit without mutating the source state", () => {
    const start = createX01(options, [{ id: "a", name: "Ada" }]);
    const oneDart = applyDart(start, dart(20, 3));

    expect(x01PlayerStats(start, "a")).toMatchObject({
      pointsScored: 0,
      dartsThrown: 0,
      visits: 0,
      threeDartAverage: 0,
    });
    expect(x01PlayerStats(oneDart, "a")).toMatchObject({
      pointsScored: 60,
      dartsThrown: 1,
      visits: 1,
      threeDartAverage: 180,
    });
  });

  it("counts pre-open darts under double-in rules", () => {
    const solo = [{ id: "a", name: "Ada" }];
    let state = createX01(
      { ...options, startingScore: 40, inRule: "double" },
      solo,
    );

    state = applyDart(state, dart(20));
    state = applyDart(state, dart(10, 2));
    state = applyDart(state, dart(10, 2));

    expect(x01PlayerStats(state, "a")).toMatchObject({
      pointsScored: 40,
      dartsThrown: 3,
      visits: 1,
      threeDartAverage: 40,
    });
  });

  it("rejects statistics for a player outside the match", () => {
    const state = createX01(options, players);
    expect(() => x01PlayerStats(state, "missing")).toThrow("Unknown X01 player");
  });
});

describe("X01 aggregate score entry", () => {
  it("records a safe aggregate visit without inventing dart objects", () => {
    const start = createX01(options, players);
    const state = applyAggregateVisit(start, { score: 100, dartsThrown: 3 });

    expect(start.scores[0]).toBe(301);
    expect(state).toMatchObject({ scores: [201, 301], currentPlayer: 1 });
    expect(state.turns[0]).toMatchObject({
      source: "aggregate",
      darts: [],
      dartsThrown: 3,
      aggregateScore: 100,
      scoreBefore: 301,
      scoreAfter: 201,
      bust: false,
    });
    expect(x01PlayerStats(state, "a")).toMatchObject({
      pointsScored: 100,
      dartsThrown: 3,
      visits: 1,
      threeDartAverage: 100,
    });
  });

  it("allows a partial-dart straight-out aggregate finish", () => {
    const state = applyAggregateVisit(
      createX01(
        { ...options, startingScore: 40, outRule: "straight" },
        [{ id: "a", name: "Ada" }],
      ),
      { score: 40, dartsThrown: 1 },
    );

    expect(state).toMatchObject({ status: "complete", scores: [0], legs: [1] });
    expect(x01PlayerStats(state, "a")).toMatchObject({
      pointsScored: 40,
      dartsThrown: 1,
      visits: 1,
      threeDartAverage: 120,
    });
  });

  it.each(["double", "master"] as const)(
    "requires per-dart evidence for an exact %s-out aggregate finish",
    (outRule) => {
      const state = createX01(
        { ...options, startingScore: 40, outRule },
        players,
      );

      try {
        applyAggregateVisit(state, { score: 40, dartsThrown: 1 });
        throw new Error("Expected aggregate finish to require darts");
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateVisitRequiresDartsError);
        expect(error).toMatchObject({
          code: "DART_SEQUENCE_REQUIRED",
          reason: "out-rule",
        });
      }
    },
  );

  it.each(["double", "master"] as const)(
    "requires per-dart evidence while unopened under %s-in rules",
    (inRule) => {
      const state = createX01({ ...options, inRule }, players);

      try {
        applyAggregateVisit(state, { score: 100, dartsThrown: 3 });
        throw new Error("Expected aggregate opening visit to require darts");
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateVisitRequiresDartsError);
        expect(error).toMatchObject({
          code: "DART_SEQUENCE_REQUIRED",
          reason: "in-rule",
        });
      }
    },
  );

  it("accepts aggregate entry after opening has been proven per dart", () => {
    const solo = [{ id: "a", name: "Ada" }];
    let state = createX01({ ...options, inRule: "double" }, solo);
    state = applyDart(state, dart(20, 2));
    state = applyDart(state, dart(0));
    state = applyDart(state, dart(0));
    state = applyAggregateVisit(state, { score: 100, dartsThrown: 3 });

    expect(state.scores[0]).toBe(161);
    expect(state.opened[0]).toBe(true);
    expect(state.turns[1]).toMatchObject({
      source: "aggregate",
      aggregateScore: 100,
    });
  });

  it("records a sequence-independent aggregate bust with its actual darts", () => {
    const state = applyAggregateVisit(
      createX01(
        { ...options, startingScore: 40 },
        [{ id: "a", name: "Ada" }],
      ),
      { score: 39, dartsThrown: 2 },
    );

    expect(state.scores[0]).toBe(40);
    expect(state.turns[0]).toMatchObject({
      source: "aggregate",
      dartsThrown: 2,
      aggregateScore: 39,
      bust: true,
      scoreBefore: 40,
      scoreAfter: 40,
    });
    expect(x01PlayerStats(state, "a")).toMatchObject({
      pointsScored: 0,
      dartsThrown: 2,
      visits: 1,
      threeDartAverage: 0,
    });
  });

  it("rejects a partial-dart aggregate that neither busts nor finishes", () => {
    const state = createX01(options, players);
    expect(() =>
      applyAggregateVisit(state, { score: 20, dartsThrown: 1 }),
    ).toThrow("A non-finishing aggregate visit must contain three darts");
  });

  it("rejects an aggregate score impossible in the declared darts", () => {
    const state = createX01(options, players);
    expect(() =>
      applyAggregateVisit(state, { score: 179, dartsThrown: 3 }),
    ).toThrow("Aggregate score cannot be made with the declared darts");
  });

  it("requires one entry mode for the whole visit", () => {
    const oneDart = applyDart(createX01(options, players), dart(20));

    try {
      applyAggregateVisit(oneDart, { score: 60, dartsThrown: 3 });
      throw new Error("Expected mixed entry to require darts");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateVisitRequiresDartsError);
      expect(error).toMatchObject({
        code: "DART_SEQUENCE_REQUIRED",
        reason: "mixed-entry",
      });
    }
  });

  it("undoes an aggregate visit to the exact prior immutable state", () => {
    const start = createX01(options, players);
    const afterVisit = applyAggregateVisit(start, { score: 100, dartsThrown: 3 });
    const restored = undoLastDart(afterVisit);

    expect(restored).toEqual(start);
    expect(afterVisit.scores[0]).toBe(201);
  });
});
