import { describe, expect, it } from "vitest";
import {
  appendCricketEvent,
  appendEvent,
  appendRoundEvent,
  createCricketLog,
  createLog,
  createRoundLog,
  cricketDartEvent,
  cricketMatchRecord,
  dart,
  dartEvent,
  parseMatchRecord,
  recordedPlayer,
  roundDartEvent,
  roundMatchRecord,
  visitEvent,
  x01MatchRecord,
  type CricketLog,
  type MatchRecord,
  type RoundLog,
  type X01Log,
  type X01Options,
} from "@/domain";

const FINISHABLE: X01Options = {
  startingScore: 40,
  legsToWin: 1,
  setsToWin: 1,
  inRule: "straight",
  outRule: "double",
};

const PLAYERS = [{ id: "you", name: "Player 1" }, { id: "ai", name: "The Navigator" }] as const;

function x01Finished(): X01Log {
  // Double twenty from forty is a legal one-dart finish, so this is the shortest
  // complete match the rules allow.
  return appendEvent(createLog(FINISHABLE, PLAYERS), dartEvent(dart(20, 2)));
}

describe("the record every mode reduces to", () => {
  it("records an X01 finish with its winner, its darts, and the seat that threw them", () => {
    const record = x01MatchRecord(x01Finished(), [{}, { isBot: true, botLevel: 14 }]);

    expect(record.mode).toBe("x01");
    expect(record.winnerSeat).toBe(0);
    expect(record.players).toEqual([
      { seat: 0, displayName: "Player 1", isBot: false },
      { seat: 1, displayName: "The Navigator", isBot: true, botLevel: 14 },
    ]);
    expect(record.turns).toHaveLength(1);
    expect(record.turns[0]).toMatchObject({
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 40,
      scoreAfter: 0,
      bust: false,
      dartsThrown: 1,
    });
    expect(record.turns[0]?.darts).toEqual([{ ordinal: 1, segment: 20, multiplier: 2 }]);
  });

  it("keeps the score a typed visit claimed, which a bust would otherwise erase", () => {
    // 501, then a claimed 60 that leaves 441: entered as a total, so no darts exist.
    const log = appendEvent(createLog({ ...FINISHABLE, startingScore: 501 }, PLAYERS), visitEvent(60, 3));
    const [turn] = x01MatchRecord(log).turns;

    expect(turn?.darts).toEqual([]);
    expect(turn?.aggregateScore).toBe(60);
    expect(turn?.dartsThrown).toBe(3);
    expect(turn?.scoreAfter).toBe(441);
  });

  it("records a Cricket visit against the thrower's own points", () => {
    let log: CricketLog = createCricketLog({ variant: "standard", winByTwo: false, roundLimit: null }, PLAYERS);
    for (const value of [dart(20, 3), dart(20, 3), dart(20, 1)]) {
      log = appendCricketEvent(log, cricketDartEvent(value));
    }
    const record = cricketMatchRecord(log);

    expect(record.mode).toBe("cricket");
    expect(record.turns).toHaveLength(1);
    // Twenty is closed by the first three marks; the rest of the visit scores points.
    expect(record.turns[0]).toMatchObject({ seat: 0, turnNumber: 1, legNumber: 1, scoreBefore: 0, bust: false, dartsThrown: 3 });
    expect(record.turns[0]?.scoreAfter).toBeGreaterThan(0);
    expect(record.turns[0]?.darts).toHaveLength(3);
  });

  it("records a round-mode visit against the running total", () => {
    let log: RoundLog = createRoundLog("countUp", PLAYERS);
    for (const value of [dart(20, 3), dart(20, 1), dart(5, 1)]) {
      log = appendRoundEvent(log, roundDartEvent(value));
    }
    const record = roundMatchRecord(log);

    expect(record.mode).toBe("countUp");
    expect(record.options).toEqual({});
    expect(record.turns[0]).toMatchObject({ seat: 0, legNumber: 1, scoreBefore: 0, scoreAfter: 85, dartsThrown: 3 });
  });

  it("does not put a bot level on a seat a person played", () => {
    expect(recordedPlayer(0, "Player 1", { isBot: false, botLevel: 12 })).toEqual({
      seat: 0,
      displayName: "Player 1",
      isBot: false,
    });
  });
});

describe("what the boundary refuses", () => {
  const valid: MatchRecord = x01MatchRecord(x01Finished());

  it("accepts a record its own adapter produced", () => {
    expect(parseMatchRecord(valid)).not.toBeNull();
  });

  it.each([
    ["a bed that is not on the board", { segment: 21, multiplier: 1 }],
    ["a treble bull, which does not exist", { segment: 25, multiplier: 3 }],
    ["a multiplied miss", { segment: 0, multiplier: 2 }],
  ])("refuses %s", (_label, thrown) => {
    const record = { ...valid, turns: [{ ...valid.turns[0]!, darts: [{ ordinal: 1, ...thrown }] }] };
    expect(parseMatchRecord(record)).toBeNull();
  });

  it("refuses a visit thrown from a seat nobody occupied", () => {
    expect(parseMatchRecord({ ...valid, turns: [{ ...valid.turns[0]!, seat: 5 }] })).toBeNull();
  });

  it("refuses a winner who was not playing", () => {
    expect(parseMatchRecord({ ...valid, winnerSeat: 4 })).toBeNull();
  });

  it("refuses two visits claiming the same place in the order", () => {
    const turn = valid.turns[0]!;
    expect(parseMatchRecord({ ...valid, turns: [turn, { ...turn, seat: 1 }] })).toBeNull();
  });

  it("refuses a match nobody played", () => {
    expect(parseMatchRecord({ ...valid, turns: [] })).toBeNull();
  });

  it("refuses a visit whose darts and dart count disagree", () => {
    const turn = valid.turns[0]!;
    expect(parseMatchRecord({ ...valid, turns: [{ ...turn, dartsThrown: 3 }] })).toBeNull();
  });

  it("refuses a gapped or duplicate exact-dart chronology", () => {
    const turn = valid.turns[0]!;
    const second = { ...turn.darts[0]!, ordinal: 2 as const };
    const third = { ...turn.darts[0]!, ordinal: 3 as const };
    expect(parseMatchRecord({ ...valid, turns: [{ ...turn, dartsThrown: 2, darts: [second, third] }] })).toBeNull();
    expect(parseMatchRecord({ ...valid, turns: [{ ...turn, dartsThrown: 2, darts: [second, second] }] })).toBeNull();
  });

  it("refuses unknown fields rather than storing them", () => {
    expect(parseMatchRecord({ ...valid, sneaky: true })).toBeNull();
  });
});
