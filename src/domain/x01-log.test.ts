import { describe, expect, it } from "vitest";
import {
  appendEvent,
  createLog,
  dart,
  dartEvent,
  deserializeX01Log,
  rewindToVisit,
  replaceEvent,
  replay,
  serializeX01Log,
  undoLastEvent,
  visitEvent,
  visitRange,
  x01PlayerStats,
  type X01Log,
  type X01Options,
} from "@/domain";

const OPTIONS: X01Options = {
  startingScore: 501,
  legsToWin: 1,
  setsToWin: 1,
  inRule: "straight",
  outRule: "double",
};
const PLAYERS = [{ id: "you", name: "Player 1" }, { id: "them", name: "Player 2" }] as const;

const base = () => createLog(OPTIONS, [...PLAYERS]);
const withDarts = (log: X01Log, ...beds: readonly (readonly [number, 1 | 2 | 3])[]): X01Log =>
  beds.reduce((current, [segment, multiplier]) =>
    appendEvent(current, dartEvent(dart(segment as 20, multiplier))), log);

describe("X01 event log", () => {
  it("derives the same state from the same log every time", () => {
    const log = withDarts(base(), [20, 3], [20, 3], [20, 1]);
    const first = replay(log);
    const second = replay(log);
    expect(first.state.scores[0]).toBe(501 - (60 + 60 + 20));
    expect(first.state.scores).toEqual(second.state.scores);
    expect(first.state.turns).toEqual(second.state.turns);
    expect(first.rejected).toEqual([]);
  });

  it("counts a completed visit once the third dart lands", () => {
    const log = withDarts(base(), [20, 3], [20, 3], [20, 3]);
    const { state } = replay(log);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]!.dartsThrown).toBe(3);
    expect(state.currentPlayer).toBe(1);
  });

  it("mixes per-dart and aggregate visits on one canonical path", () => {
    const log = appendEvent(withDarts(base(), [20, 3], [20, 3], [20, 3]), visitEvent(100, 3));
    const { state, rejected } = replay(log);
    expect(rejected).toEqual([]);
    expect(state.scores).toEqual([321, 401]);
    expect(state.turns.map((turn) => turn.source)).toEqual(["darts", "aggregate"]);
  });

  it("undoes the latest event without touching anything earlier", () => {
    const log = withDarts(base(), [20, 3], [19, 3]);
    const shortened = undoLastEvent(log);
    expect(shortened.events).toHaveLength(1);
    expect(replay(shortened).state.scores[0]).toBe(441);
    expect(undoLastEvent(base()).events).toEqual([]);
  });

  it("corrects a dart from an earlier visit and replays everything after it", () => {
    // One visit each; the very first dart was actually T19, not T20.
    const log = withDarts(base(), [20, 3], [20, 3], [20, 3], [20, 3], [20, 3], [20, 3]);
    expect(replay(log).state.scores).toEqual([321, 321]);

    const corrected = replaceEvent(log, 0, dartEvent(dart(19, 3)));
    const { state, rejected } = replay(corrected);
    expect(rejected).toEqual([]);
    // Three points came back to player one; the opponent is untouched.
    expect(state.scores).toEqual([324, 321]);
    // The later visit was not discarded, just recomputed.
    expect(state.turns).toHaveLength(2);
  });

  it("reports events the rules refuse after a correction instead of dropping them", () => {
    /*
     * An aggregate visit cannot land on zero under double-out, because no bed
     * sequence is recorded to prove the finish was a double. Correcting the
     * third dart of the opening visit from a miss to T20 drops the player from
     * 201 to 141 before that aggregate 141 — which now finishes, and must be
     * refused rather than silently accepted.
     */
    const log = appendEvent(
      withDarts(
        base(),
        [20, 3], [20, 3], [0, 1], // 381
        [1, 1], [1, 1], [1, 1],
        [20, 3], [20, 3], [20, 3], // 201
        [1, 1], [1, 1], [1, 1],
      ),
      visitEvent(141, 3),
    );
    const before = replay(log);
    expect(before.rejected).toEqual([]);
    expect(before.state.scores[0]).toBe(60);

    const corrected = replaceEvent(log, 2, dartEvent(dart(20, 3)));
    const result = replay(corrected);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.index).toBe(log.events.length - 1);
    expect(result.rejected[0]!.reason).toContain("out-rule");
    // The refused visit changed nothing: the player is still on 141.
    expect(result.state.scores[0]).toBe(141);
  });

  it("locates a completed visit and rewinds the match to just before it", () => {
    const log = withDarts(
      base(),
      [20, 3], [20, 3], [20, 3],
      [5, 1], [5, 1], [5, 1],
      [19, 3], [19, 3], [19, 3],
    );
    expect(visitRange(log, 0)).toEqual({ start: 0, end: 3 });
    expect(visitRange(log, 1)).toEqual({ start: 3, end: 6 });
    expect(visitRange(log, 2)).toEqual({ start: 6, end: 9 });
    expect(visitRange(log, 3)).toBeNull();

    /*
     * Rewinding to visit 1 keeps visit 0 and discards everything from visit 1
     * on. Excising the middle instead would hand visit 2 to the wrong player,
     * because the log records what was thrown and turn order decides who threw
     * it — that is exactly the bug this primitive exists to avoid.
     */
    const rewound = rewindToVisit(log, 1);
    expect(rewound.events).toHaveLength(3);
    const { state } = replay(rewound);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]!.playerId).toBe("you");
    expect(state.currentPlayer).toBe(1);
  });

  it("treats a bust as one visit however few darts it took", () => {
    // 501 → 2 left is not reachable quickly, so bust on the opening visit by
    // taking the score below zero is impossible; use a one-dart finish instead.
    const log = withDarts(base(), [20, 3], [20, 3], [20, 3], [20, 3]);
    expect(visitRange(log, 0)).toEqual({ start: 0, end: 3 });
    expect(replay(log).state.turns).toHaveLength(1);
  });

  it("rejects an index that does not exist", () => {
    expect(() => replaceEvent(base(), 0, visitEvent(60, 3))).toThrow("No event at index 0");
    expect(() => rewindToVisit(base(), 0)).toThrow("No completed visit at index 0");
  });
});

describe("X01 log persistence", () => {
  it("round-trips a log exactly", () => {
    const log = appendEvent(withDarts(base(), [20, 3], [5, 2]), visitEvent(60, 3));
    const restored = deserializeX01Log(serializeX01Log(log));
    expect(restored).toEqual(log);
    expect(replay(restored!).state.scores).toEqual(replay(log).state.scores);
  });

  it("keeps dart coordinates so a resumed board shows where the darts landed", () => {
    const log = appendEvent(base(), dartEvent(dart(20, 3, { x: 0.1, y: -0.6 })));
    const restored = deserializeX01Log(serializeX01Log(log))!;
    expect(restored.events[0]).toMatchObject({ x: 0.1, y: -0.6 });
  });

  it("discards anything that is not a current, well-formed log", () => {
    expect(deserializeX01Log(null)).toBeNull();
    expect(deserializeX01Log("")).toBeNull();
    expect(deserializeX01Log("not json")).toBeNull();
    expect(deserializeX01Log(JSON.stringify({ version: 99, options: OPTIONS, players: PLAYERS, events: [] }))).toBeNull();
    // An impossible bed must not survive into a replay.
    expect(deserializeX01Log(JSON.stringify({
      version: 1, options: OPTIONS, players: PLAYERS,
      events: [{ kind: "dart", segment: 25, multiplier: 3 }],
    }))).toBeNull();
    // Unknown keys are a shape change, which is a discard, not a coercion.
    expect(deserializeX01Log(JSON.stringify({
      version: 1, options: OPTIONS, players: PLAYERS, events: [], extra: true,
    }))).toBeNull();
  });
});

describe("regulation statistics", () => {
  it("reports first nine over the opening three visits of the leg", () => {
    const log = withDarts(
      base(),
      [20, 3], [20, 3], [20, 3], // 180
      [1, 1], [1, 1], [1, 1],
      [20, 3], [20, 1], [20, 1], // 100
      [1, 1], [1, 1], [1, 1],
      [20, 3], [20, 3], [1, 1], // 121
      [1, 1], [1, 1], [1, 1],
      [5, 1], [5, 1], [5, 1], // fourth visit must not count toward first nine
    );
    const stats = x01PlayerStats(replay(log).state, "you");
    expect(stats.visits).toBe(4);
    expect(stats.firstNineAverage).toBeCloseTo((180 + 100 + 121) / 9 * 3, 6);
    expect(stats.threeDartAverage).toBeCloseTo((180 + 100 + 121 + 15) / 12 * 3, 6);
    expect(stats.bestVisit).toBe(180);
  });

  it("counts a checkout attempt from arriving on a finishable score, not from winning", () => {
    const log = withDarts(
      base(),
      [20, 3], [20, 3], [20, 3], // 321
      [1, 1], [1, 1], [1, 1],
      [20, 3], [20, 3], [20, 3], // 141 — next visit is an attempt
      [1, 1], [1, 1], [1, 1],
      [20, 3], [20, 3], [1, 1], // missed the finish, 20 left — another attempt
      [1, 1], [1, 1], [1, 1],
      [10, 2], // finished
    );
    const stats = x01PlayerStats(replay(log).state, "you");
    expect(stats.checkoutAttempts).toBe(2);
    expect(stats.checkoutsHit).toBe(1);
    expect(stats.checkoutPercentage).toBeCloseTo(50, 6);
    expect(stats.legsWon).toBe(1);
  });

  it("reads zero rather than undefined before anything has been thrown", () => {
    const stats = x01PlayerStats(replay(base()).state, "you");
    expect(stats).toMatchObject({
      threeDartAverage: 0, firstNineAverage: 0, checkoutAttempts: 0,
      checkoutsHit: 0, checkoutPercentage: 0, bustCount: 0, bestVisit: 0,
    });
  });
});
