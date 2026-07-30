import { describe, expect, it } from "vitest";
import {
  appendEvent,
  careerStats,
  createLog,
  dart,
  dartEvent,
  replay,
  x01MatchRecord,
  x01PlayerStats,
  type StatMatch,
  type X01Log,
  type X01Options,
} from "@/domain";

const OPTIONS: X01Options = {
  startingScore: 101,
  legsToWin: 1,
  setsToWin: 1,
  inRule: "straight",
  outRule: "double",
};
const PLAYERS = [{ id: "you", name: "Player 1" }, { id: "ai", name: "The Navigator" }] as const;

/**
 * One player, one leg, alone: 101 taken out in three darts across two visits.
 * A solo log keeps every visit the same player's, which is what makes the
 * comparison against `x01PlayerStats` a comparison of the maths and not of the
 * turn order.
 */
function soloLeg(): X01Log {
  let log = createLog(OPTIONS, [PLAYERS[0]]);
  for (const value of [dart(20, 3), dart(9, 1), dart(16, 2)]) {
    log = appendEvent(log, dartEvent(value));
  }
  return log;
}

function asStatMatch(log: X01Log, won = true): StatMatch {
  const record = x01MatchRecord(log);
  return {
    id: "match-1",
    mode: "x01",
    outRule: "double",
    won,
    turns: record.turns.filter((turn) => turn.seat === 0).map((turn) => ({
      legNumber: turn.legNumber,
      scoreBefore: turn.scoreBefore,
      scoreAfter: turn.scoreAfter,
      bust: turn.bust,
      dartsThrown: turn.dartsThrown,
    })),
  };
}

describe("career statistics agree with the live match they came from", () => {
  const log = soloLeg();

  it("computes the same three-dart average, first nine, checkout, and best visit", () => {
    const live = x01PlayerStats(replay(log).state, "you");
    const career = careerStats([asStatMatch(log)]);

    expect(career.x01.threeDartAverage).toBeCloseTo(live.threeDartAverage, 10);
    expect(career.x01.firstNineAverage).toBeCloseTo(live.firstNineAverage, 10);
    expect(career.x01.checkoutAttempts).toBe(live.checkoutAttempts);
    expect(career.x01.checkoutsHit).toBe(live.checkoutsHit);
    expect(career.x01.checkoutPercentage).toBeCloseTo(live.checkoutPercentage, 10);
    expect(career.x01.bestVisit).toBe(live.bestVisit);
    expect(career.x01.busts).toBe(live.bustCount);
    expect(career.visits).toBe(live.visits);
    expect(career.dartsThrown).toBe(live.dartsThrown);
  });

  it("records the leg it was won in and how many darts it took", () => {
    // 101 out in three darts: sixty, nine, double sixteen.
    expect(careerStats([asStatMatch(log)]).x01.bestLegDarts).toBe(3);
  });
});

describe("career statistics across matches", () => {
  const base = asStatMatch(soloLeg());

  it("counts matches, wins, and the win percentage", () => {
    const stats = careerStats([base, { ...base, id: "match-2", won: false }]);

    expect(stats.matchesPlayed).toBe(2);
    expect(stats.matchesWon).toBe(1);
    expect(stats.winPercentage).toBe(50);
  });

  it("keeps the best leg across matches, not within one", () => {
    const slower: StatMatch = {
      ...base,
      id: "match-2",
      turns: [{ legNumber: 1, scoreBefore: 40, scoreAfter: 40, bust: true, dartsThrown: 3 },
        { legNumber: 1, scoreBefore: 40, scoreAfter: 0, bust: false, dartsThrown: 2 }],
    };
    expect(careerStats([slower, base]).x01.bestLegDarts).toBe(3);
    expect(careerStats([slower]).x01.bestLegDarts).toBe(5);
  });

  it("tallies each mode and keeps non-X01 modes out of the X01 figures", () => {
    const cricket: StatMatch = {
      id: "match-3",
      mode: "cricket",
      outRule: null,
      won: true,
      turns: [{ legNumber: 1, scoreBefore: 0, scoreAfter: 60, bust: false, dartsThrown: 3 }],
    };
    const stats = careerStats([base, cricket, { ...cricket, id: "match-4", won: false }]);

    expect(stats.modes).toEqual([
      { mode: "cricket", played: 2, won: 1 },
      { mode: "x01", played: 1, won: 1 },
    ]);
    expect(stats.x01.matches).toBe(1);
    // Cricket's points climb rather than fall, so counting them as scored would
    // read as a negative average.
    expect(stats.x01.threeDartAverage).toBeCloseTo(101, 10);
    expect(stats.dartsThrown).toBe(9);
  });

  it("reads an empty career as empty rather than as zeroes", () => {
    const stats = careerStats([]);

    expect(stats).toMatchObject({ matchesPlayed: 0, matchesWon: 0, winPercentage: 0, visits: 0, dartsThrown: 0 });
    expect(stats.x01.bestLegDarts).toBeNull();
    expect(stats.x01.checkoutPercentage).toBe(0);
    expect(stats.modes).toEqual([]);
  });

  it("scores a bust as nothing, because a bust restores the score it started from", () => {
    const busted: StatMatch = {
      ...base,
      turns: [{ legNumber: 1, scoreBefore: 60, scoreAfter: 60, bust: true, dartsThrown: 3 }],
    };
    expect(careerStats([busted]).x01.threeDartAverage).toBe(0);
    expect(careerStats([busted]).x01.busts).toBe(1);
    expect(careerStats([busted]).x01.bestVisit).toBe(0);
  });

  it("uses the match's own out rule to decide what a checkout attempt was", () => {
    // 1 is finishable straight-out and impossible double-out, so the same visit
    // counts as an attempt under one rule and not under the other.
    const onOne: StatMatch = {
      ...base,
      turns: [{ legNumber: 1, scoreBefore: 1, scoreAfter: 0, bust: false, dartsThrown: 1 }],
    };
    expect(careerStats([{ ...onOne, outRule: "straight" }]).x01.checkoutAttempts).toBe(1);
    expect(careerStats([{ ...onOne, outRule: "double" }]).x01.checkoutAttempts).toBe(0);
  });
});
