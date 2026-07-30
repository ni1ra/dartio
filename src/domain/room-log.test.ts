import { describe, expect, it } from "vitest";
import {
  appendEvent,
  createLog,
  dart,
  dartEvent,
  replay,
  visitEvent,
  x01LogFromTurns,
  x01MatchRecord,
  type X01Log,
  type X01Options,
} from "@/domain";

/**
 * A room's record lives on the server as rows, so joining or rejoining one means
 * turning them back into a log. That makes `x01MatchRecord` and `x01LogFromTurns`
 * inverses of each other, and this asserts it rather than assuming it: a log that
 * survives the round trip is a match that survives a reconnect.
 */
const OPTIONS: X01Options = {
  startingScore: 501,
  legsToWin: 1,
  setsToWin: 1,
  inRule: "straight",
  outRule: "double",
};
const PLAYERS = [{ id: "you", name: "Player 1" }, { id: "them", name: "Player 2" }] as const;

function roundTrip(log: X01Log): X01Log {
  return x01LogFromTurns(log.options, log.players, x01MatchRecord(log).turns);
}

describe("a log survives being stored and rebuilt", () => {
  it("round-trips a match thrown dart by dart", () => {
    let log = createLog(OPTIONS, PLAYERS);
    for (const value of [dart(20, 3), dart(20, 3), dart(20, 1), dart(19, 3), dart(19, 3), dart(19, 1)]) {
      log = appendEvent(log, dartEvent(value));
    }

    expect(roundTrip(log).events).toEqual(log.events);
    expect(replay(roundTrip(log)).state.scores).toEqual(replay(log).state.scores);
  });

  it("round-trips a visit that was typed as a total", () => {
    let log = createLog(OPTIONS, PLAYERS);
    log = appendEvent(log, visitEvent(140, 3));
    log = appendEvent(log, visitEvent(60, 3));

    expect(roundTrip(log).events).toEqual(log.events);
  });

  it("keeps the score a typed visit claimed even though it busted", () => {
    // 501 down to 20, then a claimed 40 that cannot finish on 20: the score is
    // restored, and the only record of what was entered is the stored total.
    let log = createLog({ ...OPTIONS, startingScore: 60 }, PLAYERS);
    log = appendEvent(log, visitEvent(40, 3));
    log = appendEvent(log, visitEvent(0, 3));
    log = appendEvent(log, visitEvent(40, 2));

    const rebuilt = roundTrip(log);
    expect(rebuilt.events).toEqual(log.events);
    expect(replay(rebuilt).state.turns.map((turn) => turn.bust)).toEqual(replay(log).state.turns.map((turn) => turn.bust));
  });

  it("keeps where each dart physically landed", () => {
    let log = createLog(OPTIONS, PLAYERS);
    // A whole visit, because only completed visits are stored — which is also the
    // rule a room plays by: an opponent sees your visit when you finish it, not
    // dart by dart.
    log = appendEvent(log, dartEvent(dart(20, 3, { x: 0.25, y: -0.5 })));
    log = appendEvent(log, dartEvent(dart(20, 1)));
    log = appendEvent(log, dartEvent(dart(5, 1)));

    const [event] = roundTrip(log).events;
    expect(event).toMatchObject({ kind: "dart", segment: 20, multiplier: 3, x: 0.25, y: -0.5 });
  });

  it("does not carry a visit that is still being thrown", () => {
    let log = createLog(OPTIONS, PLAYERS);
    log = appendEvent(log, dartEvent(dart(20, 3)));

    // One dart is not a visit, so there is nothing to store and nothing to rebuild.
    expect(x01MatchRecord(log).turns).toEqual([]);
    expect(roundTrip(log).events).toEqual([]);
  });

  it("rebuilds in turn order however the rows arrive", () => {
    let log = createLog(OPTIONS, PLAYERS);
    for (const value of [dart(20, 1), dart(5, 1), dart(1, 1)]) log = appendEvent(log, dartEvent(value));
    const turns = x01MatchRecord(log).turns;

    // A reconnect has no promise about row order beyond the turn number.
    const shuffled = [...turns].reverse();
    expect(x01LogFromTurns(OPTIONS, PLAYERS, shuffled).events).toEqual(log.events);
  });

  it("rebuilds an empty room as a match nobody has thrown in yet", () => {
    const rebuilt = x01LogFromTurns(OPTIONS, PLAYERS, []);
    expect(rebuilt.events).toEqual([]);
    expect(replay(rebuilt).state.scores).toEqual([501, 501]);
  });
});
