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
  type MatchResult,
  type StatMatch,
  type StatTurn,
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
const BASE_TIME = "2026-08-01T12:00:00.000Z";

/** One player takes out 101 in three darts across two visits. */
function soloLeg(): X01Log {
  let log = createLog(OPTIONS, [PLAYERS[0]]);
  for (const value of [dart(20, 3), dart(9, 1), dart(16, 2)]) {
    log = appendEvent(log, dartEvent(value));
  }
  return log;
}

function asStatMatch(
  log: X01Log,
  result: MatchResult = "won",
  id = "match-1",
  completedAt = BASE_TIME,
): StatMatch {
  const record = x01MatchRecord(log);
  return {
    id,
    mode: "x01",
    completedAt,
    outRule: "double",
    result,
    turns: record.turns.filter((turn) => turn.seat === 0).map((turn) => ({
      legNumber: turn.legNumber,
      scoreBefore: turn.scoreBefore,
      scoreAfter: turn.scoreAfter,
      bust: turn.bust,
      dartsThrown: turn.dartsThrown,
      darts: turn.darts.map(({ ordinal, segment, multiplier }) => ({ ordinal, segment, multiplier })),
    })),
  };
}

function statTurn(overrides: Partial<StatTurn> = {}): StatTurn {
  return {
    legNumber: 1,
    scoreBefore: 40,
    scoreAfter: 0,
    bust: false,
    dartsThrown: 1,
    darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    ...overrides,
  };
}

function statMatch(overrides: Partial<StatMatch> = {}): StatMatch {
  return {
    id: "match-1",
    mode: "x01",
    completedAt: BASE_TIME,
    result: "won",
    outRule: "double",
    turns: [statTurn()],
    ...overrides,
  };
}

function at(day: number): string {
  return `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`;
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
    expect(careerStats([asStatMatch(log)]).x01.bestLegDarts).toBe(3);
  });
});

describe("career headline", () => {
  it("keeps sessions but calculates wins over competitive matches only", () => {
    const practice = statMatch({
      id: "practice-1",
      mode: "checkoutLab",
      result: "unscored",
      outRule: null,
      turns: [statTurn({ scoreBefore: 0, scoreAfter: 8 })],
    });
    const stats = careerStats([statMatch(), practice]);

    expect(stats).toMatchObject({
      matchesPlayed: 2,
      competitiveMatches: 1,
      practiceSessions: 1,
      matchesWon: 1,
      winPercentage: 100,
    });
  });

  it("reads an all-practice career as sessions without inventing a win rate", () => {
    const stats = careerStats([statMatch({ mode: "scoringSprint", result: "unscored", outRule: null })]);
    expect(stats).toMatchObject({ matchesPlayed: 1, competitiveMatches: 0, practiceSessions: 1, winPercentage: 0 });
  });

  it("does not relabel a winnerless non-drill record as practice", () => {
    const stats = careerStats([statMatch({ mode: "x01", result: "unscored" })]);

    expect(stats).toMatchObject({
      matchesPlayed: 1,
      competitiveMatches: 0,
      practiceSessions: 0,
      matchesWon: 0,
      winPercentage: 0,
    });
    expect(stats.modes).toEqual([{
      mode: "x01",
      played: 1,
      won: 0,
      lost: 0,
      unscored: 1,
      visits: 1,
      dartsThrown: 1,
      winPercentage: null,
    }]);
  });

  it("does not let a generic winner field turn a known drill into competition", () => {
    const stats = careerStats([statMatch({
      mode: "checkoutLab",
      result: "won",
      outRule: null,
      turns: [statTurn({ scoreBefore: 0, scoreAfter: 8 })],
    })]);

    expect(stats).toMatchObject({
      matchesPlayed: 1,
      competitiveMatches: 0,
      practiceSessions: 1,
      matchesWon: 0,
      winPercentage: 0,
      recentForm: [],
    });
    expect(stats.modes).toEqual([{
      mode: "checkoutLab",
      played: 1,
      won: 0,
      lost: 0,
      unscored: 1,
      visits: 1,
      dartsThrown: 1,
      winPercentage: null,
    }]);
  });
});

describe("observed finishing beds", () => {
  it("attributes only complete exact checkouts that actually finish on a double", () => {
    const stats = careerStats([
      statMatch({ id: "d20-a", turns: [statTurn()] }),
      statMatch({ id: "d20-b", turns: [statTurn()] }),
      statMatch({
        id: "d16",
        turns: [statTurn({ scoreBefore: 32, darts: [{ ordinal: 1, segment: 16, multiplier: 2 }] })],
      }),
    ]);

    expect(stats.x01.finishingBeds).toEqual([
      { segment: 20, hits: 2, share: 200 / 3 },
      { segment: 16, hits: 1, share: 100 / 3 },
    ]);
    expect(stats.x01.unattributedCheckouts).toBe(0);
  });

  it("keeps aggregate, partial, and non-double successes unattributed", () => {
    const aggregate = statMatch({
      id: "aggregate",
      turns: [statTurn({ scoreBefore: 32, dartsThrown: 2, darts: [] })],
    });
    const partial = statMatch({
      id: "partial",
      turns: [statTurn({ scoreBefore: 20, dartsThrown: 2, darts: [{ ordinal: 2, segment: 10, multiplier: 2 }] })],
    });
    const single = statMatch({
      id: "single",
      turns: [statTurn({ scoreBefore: 20, darts: [{ ordinal: 1, segment: 20, multiplier: 1 }] })],
    });
    const impossibleDouble = statMatch({
      id: "invalid",
      turns: [statTurn({ scoreBefore: 2, darts: [{ ordinal: 1, segment: 0, multiplier: 2 }] })],
    });

    const stats = careerStats([aggregate, partial, single, impossibleDouble]);
    expect(stats.x01.checkoutsHit).toBe(4);
    expect(stats.x01.finishingBeds).toEqual([]);
    expect(stats.x01.unattributedCheckouts).toBe(4);
    expect(stats.x01).not.toHaveProperty("doubleAttempts");
    expect(stats.x01).not.toHaveProperty("doubleAccuracy");
  });
});

describe("chronological form and trends", () => {
  it("returns the newest twelve competitive results from oldest to newest", () => {
    const matches = Array.from({ length: 15 }, (_, index) => statMatch({
      id: `match-${index + 1}`,
      completedAt: at(index + 1),
      result: index % 2 === 0 ? "won" : "lost",
      turns: [statTurn({ scoreBefore: 60 + index, scoreAfter: 0, dartsThrown: 3, darts: [] })],
    })).reverse();
    // This newer practice session must not displace a competitive result.
    matches.push(statMatch({ id: "practice", mode: "checkoutLab", completedAt: at(16), result: "unscored", outRule: null }));

    const stats = careerStats(matches);
    expect(stats.recentForm).toHaveLength(12);
    expect(stats.recentForm.map(({ completedAt }) => completedAt)).toEqual(
      Array.from({ length: 12 }, (_, index) => at(index + 4)),
    );
    expect(stats.x01.trend).toHaveLength(12);
    expect(stats.x01.trend[0]).toMatchObject({ completedAt: at(4), result: "lost" });
    expect(stats.x01.trend.at(-1)).toMatchObject({ completedAt: at(15), result: "won" });
    expect(stats.x01.trend.every((point) => Number.isFinite(point.threeDartAverage)
      && Number.isFinite(point.checkoutPercentage))).toBe(true);
  });
});

describe("mode splits", () => {
  it("tracks results, visits, darts, and nullable competitive percentages per mode", () => {
    const stats = careerStats([
      statMatch({ id: "x01-win", result: "won", turns: [statTurn(), statTurn()] }),
      statMatch({ id: "x01-loss", result: "lost", turns: [statTurn({ dartsThrown: 3, darts: [] })] }),
      statMatch({
        id: "drill",
        mode: "doublesMatrix",
        result: "unscored",
        outRule: null,
        turns: [statTurn({ scoreBefore: 0, scoreAfter: 5, dartsThrown: 3, darts: [] })],
      }),
    ]);

    expect(stats.modes).toEqual([
      { mode: "x01", played: 2, won: 1, lost: 1, unscored: 0, visits: 3, dartsThrown: 5, winPercentage: 50 },
      { mode: "doublesMatrix", played: 1, won: 0, lost: 0, unscored: 1, visits: 1, dartsThrown: 3, winPercentage: null },
    ]);
  });

  it("keeps non-X01 scoring out of the X01 figures", () => {
    const cricket = statMatch({
      id: "cricket",
      mode: "cricket",
      outRule: null,
      turns: [statTurn({ scoreBefore: 0, scoreAfter: 60, dartsThrown: 3, darts: [] })],
    });
    const stats = careerStats([asStatMatch(soloLeg()), cricket]);
    expect(stats.x01.matches).toBe(1);
    expect(stats.x01.threeDartAverage).toBeCloseTo(101, 10);
    expect(stats.dartsThrown).toBe(6);
  });
});

describe("drill progress", () => {
  it("returns every drill with truthful nulls before it has a session", () => {
    expect(careerStats([]).drills).toEqual([
      { mode: "checkoutLab", unit: "checkouts", sessions: 0, latest: null, best: null, average: null, recent: [] },
      { mode: "doublesMatrix", unit: "doubles", sessions: 0, latest: null, best: null, average: null, recent: [] },
      { mode: "scoringSprint", unit: "points", sessions: 0, latest: null, best: null, average: null, recent: [] },
    ]);
  });

  it("aggregates every session while bounding recent values to twelve in chronological order", () => {
    const scoring = Array.from({ length: 13 }, (_, index) => statMatch({
      id: `sprint-${index + 1}`,
      mode: "scoringSprint",
      completedAt: at(index + 1),
      result: "unscored",
      outRule: null,
      turns: [statTurn({ scoreBefore: 0, scoreAfter: index + 1 })],
    })).reverse();
    const stats = careerStats(scoring);
    const sprint = stats.drills.find(({ mode }) => mode === "scoringSprint");

    expect(sprint).toMatchObject({ sessions: 13, unit: "points", latest: 13, best: 13, average: 7 });
    expect(sprint?.recent).toEqual(
      Array.from({ length: 12 }, (_, index) => ({ completedAt: at(index + 2), value: index + 2 })),
    );
  });
});

describe("existing X01 edge cases", () => {
  it("keeps the best leg across matches", () => {
    const base = asStatMatch(soloLeg());
    const slower = statMatch({
      id: "match-2",
      turns: [
        statTurn({ scoreBefore: 40, scoreAfter: 40, bust: true, dartsThrown: 3, darts: [] }),
        statTurn({ scoreBefore: 40, scoreAfter: 0, dartsThrown: 2, darts: [] }),
      ],
    });
    expect(careerStats([slower, base]).x01.bestLegDarts).toBe(3);
    expect(careerStats([slower]).x01.bestLegDarts).toBe(5);
  });

  it("scores a bust as nothing", () => {
    const busted = statMatch({
      turns: [statTurn({ scoreBefore: 60, scoreAfter: 60, bust: true, dartsThrown: 3, darts: [] })],
    });
    expect(careerStats([busted]).x01).toMatchObject({ threeDartAverage: 0, busts: 1, bestVisit: 0 });
  });

  it("uses each match's straight, master, or double out rule for the finishing bed", () => {
    const straight = careerStats([statMatch({
      outRule: "straight",
      turns: [statTurn({ scoreBefore: 20, darts: [{ ordinal: 1, segment: 20, multiplier: 1 }] })],
    })]).x01;
    expect(straight.checkoutAttempts).toBe(1);
    expect(straight.checkoutsHit).toBe(1);
    expect(straight.finishingBeds).toEqual([]);
    expect(straight.unattributedCheckouts).toBe(1);

    const master = careerStats([statMatch({
      outRule: "master",
      turns: [statTurn({
        scoreBefore: 60,
        darts: [{ ordinal: 1, segment: 20, multiplier: 3 }],
      })],
    })]).x01;
    expect(master.checkoutsHit).toBe(1);
    expect(master.finishingBeds).toEqual([]);
    expect(master.unattributedCheckouts).toBe(1);

    const double = careerStats([statMatch({
      outRule: "double",
      turns: [statTurn({ scoreBefore: 40, darts: [{ ordinal: 1, segment: 20, multiplier: 2 }] })],
    })]).x01;
    expect(double.checkoutsHit).toBe(1);
    expect(double.finishingBeds).toEqual([{ segment: 20, hits: 1, share: 100 }]);
    expect(double.unattributedCheckouts).toBe(0);
  });

  it("reads an empty career without invented performance", () => {
    const stats = careerStats([]);
    expect(stats).toMatchObject({
      matchesPlayed: 0,
      competitiveMatches: 0,
      practiceSessions: 0,
      matchesWon: 0,
      winPercentage: 0,
      visits: 0,
      dartsThrown: 0,
    });
    expect(stats.x01.bestLegDarts).toBeNull();
    expect(stats.x01.checkoutPercentage).toBe(0);
    expect(stats.modes).toEqual([]);
    expect(stats.recentForm).toEqual([]);
  });
});
