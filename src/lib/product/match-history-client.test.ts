import { describe, expect, it } from "vitest";
import type { MatchRecord } from "@/domain/match-record";
import { fetchCareerStats, fetchMatchHistory, fetchMatchReplay, recordCompletedMatch } from "./match-history-client";

const RECORD = { mode: "x01", options: {}, players: [], turns: [] } as unknown as MatchRecord;

function respond(status: number, body: unknown = {}): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

describe("filing a finished match", () => {
  it.each([
    [201, "recorded"],
    [401, "signed-out"],
    [400, "rejected"],
    [503, "unavailable"],
    [500, "unavailable"],
  ])("reads %i as %s", async (status, outcome) => {
    await expect(recordCompletedMatch(RECORD, 0, { fetcher: respond(status) })).resolves.toBe(outcome);
  });

  it("treats an unreachable network as unavailable rather than throwing into a finished match", async () => {
    const fetcher = (async () => { throw new TypeError("failed to fetch"); }) as typeof fetch;
    await expect(recordCompletedMatch(RECORD, 0, { fetcher })).resolves.toBe("unavailable");
  });
});

describe("reading history", () => {
  const entry = {
    id: "match-1",
    mode: "x01",
    completedAt: "2026-07-30T21:00:00.000Z",
    players: [{ seat: 0, displayName: "Player 1", isBot: false, botLevel: null, isYou: true }],
    winnerSeat: 0,
    turnCount: 1,
    dartCount: 3,
  };

  it("returns the matches it was given", async () => {
    await expect(fetchMatchHistory({ fetcher: respond(200, { matches: [entry] }) })).resolves.toEqual([entry]);
  });

  it.each([
    ["a refusal", respond(401)],
    ["a shape it does not recognise", respond(200, { matches: [{ id: "match-1" }] })],
  ])("returns null for %s, so a surface can say so rather than show an empty past", async (_label, fetcher) => {
    await expect(fetchMatchHistory({ fetcher })).resolves.toBeNull();
  });
});

describe("reading career statistics", () => {
  const stats = {
    matchesPlayed: 2,
    competitiveMatches: 1,
    practiceSessions: 1,
    matchesWon: 1,
    winPercentage: 100,
    visits: 3,
    dartsThrown: 7,
    threeDartAverage: 60,
    historyLimit: null,
    deep: {
      x01Matches: 1,
      firstNineAverage: 60,
      checkoutAttempts: 1,
      checkoutsHit: 1,
      checkoutPercentage: 100,
      bestVisit: 60,
      bestLegDarts: 3,
      busts: 0,
      finishingBeds: [{ segment: 20, hits: 1, share: 100 }],
      unattributedCheckouts: 0,
      recentForm: [{ completedAt: "2026-08-11T12:00:00.000Z", mode: "x01", result: "won" }],
      x01Trend: [{
        completedAt: "2026-08-11T12:00:00.000Z",
        threeDartAverage: 60,
        checkoutPercentage: 100,
        result: "won",
      }],
      modes: [
        { mode: "x01", played: 1, won: 1, lost: 0, unscored: 0, visits: 1, dartsThrown: 3, winPercentage: 100 },
        { mode: "checkoutLab", played: 1, won: 0, lost: 0, unscored: 1, visits: 2, dartsThrown: 4, winPercentage: null },
      ],
      drills: [
        {
          mode: "checkoutLab",
          unit: "checkouts",
          sessions: 1,
          latest: 8,
          best: 8,
          average: 8,
          recent: [{ completedAt: "2026-08-12T12:00:00.000Z", value: 8 }],
        },
        { mode: "doublesMatrix", unit: "doubles", sessions: 0, latest: null, best: null, average: null, recent: [] },
        { mode: "scoringSprint", unit: "points", sessions: 0, latest: null, best: null, average: null, recent: [] },
      ],
    },
  } as const;

  it("accepts the complete paid contract", async () => {
    await expect(fetchCareerStats({ fetcher: respond(200, stats) })).resolves.toEqual(stats);
  });

  it("accepts a Free response only when deep figures are absent", async () => {
    const free = { ...stats, historyLimit: 50, deep: null };
    await expect(fetchCareerStats({ fetcher: respond(200, free) })).resolves.toEqual(free);
  });

  it("accepts total sessions that include a winnerless non-drill outside both headline buckets", async () => {
    const withAbandoned = {
      ...stats,
      matchesPlayed: 3,
      visits: 4,
      dartsThrown: 8,
      deep: {
        ...stats.deep,
        modes: [
          ...stats.deep.modes,
          {
            mode: "future-mode",
            played: 1,
            won: 0,
            lost: 0,
            unscored: 1,
            visits: 1,
            dartsThrown: 1,
            winPercentage: null,
          },
        ],
      },
    };
    await expect(fetchCareerStats({ fetcher: respond(200, withAbandoned) })).resolves.toEqual(withAbandoned);
  });

  it("accepts fully unattributed checkouts when no legal double bed was observed", async () => {
    const unattributed = {
      ...stats,
      deep: { ...stats.deep, finishingBeds: [], unattributedCheckouts: 1 },
    };
    await expect(fetchCareerStats({ fetcher: respond(200, unattributed) })).resolves.toEqual(unattributed);
  });

  it("accepts custom practice outside the three fixed-drill progress cards", async () => {
    const custom = {
      ...stats,
      matchesPlayed: 3,
      practiceSessions: 2,
      visits: 4,
      dartsThrown: 9,
      deep: {
        ...stats.deep,
        modes: [...stats.deep.modes, {
          mode: "customPractice",
          played: 1,
          won: 0,
          lost: 0,
          unscored: 1,
          visits: 1,
          dartsThrown: 2,
          winPercentage: null,
        }],
      },
    };
    await expect(fetchCareerStats({ fetcher: respond(200, custom) })).resolves.toEqual(custom);
  });

  it("rejects a custom path presented as a competitive result", async () => {
    const custom = {
      ...stats,
      matchesPlayed: 3,
      competitiveMatches: 2,
      practiceSessions: 1,
      matchesWon: 2,
      visits: 4,
      dartsThrown: 9,
      deep: {
        ...stats.deep,
        recentForm: [
          ...stats.deep.recentForm,
          { completedAt: "2026-08-13T12:00:00.000Z", mode: "customPractice", result: "won" as const },
        ],
        modes: [...stats.deep.modes, {
          mode: "customPractice",
          played: 1,
          won: 1,
          lost: 0,
          unscored: 0,
          visits: 1,
          dartsThrown: 2,
          winPercentage: 100,
        }],
      },
    };
    await expect(fetchCareerStats({ fetcher: respond(200, custom) })).resolves.toBeNull();
  });

  it("requires zero percentages when there is no denominator", async () => {
    const empty = {
      matchesPlayed: 0,
      competitiveMatches: 0,
      practiceSessions: 0,
      matchesWon: 0,
      winPercentage: 0,
      visits: 0,
      dartsThrown: 0,
      threeDartAverage: 0,
      historyLimit: 50,
      deep: null,
    };
    await expect(fetchCareerStats({ fetcher: respond(200, empty) })).resolves.toEqual(empty);

    const noCheckoutAttempts = {
      ...stats,
      deep: {
        ...stats.deep,
        checkoutAttempts: 0,
        checkoutsHit: 0,
        checkoutPercentage: 0,
        finishingBeds: [],
      },
    };
    await expect(fetchCareerStats({ fetcher: respond(200, noCheckoutAttempts) })).resolves.toEqual(noCheckoutAttempts);
  });

  it.each([
    ["an extra paid field", { ...stats, deep: { ...stats.deep, doubleAccuracy: 50 } }],
    ["a malformed mode split", { ...stats, deep: { ...stats.deep, modes: [{ mode: "x01", played: 1, won: 1 }] } }],
    ["an incomplete mode split", { ...stats, deep: { ...stats.deep, modes: [stats.deep.modes[0]] } }],
    ["duplicate mode ids", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [stats.deep.modes[0], { ...stats.deep.modes[1], mode: "x01" }],
      },
    }],
    ["an X01 total that disagrees with its mode row", { ...stats, deep: { ...stats.deep, x01Matches: 2 } }],
    ["X01 matches when the mode split has no X01 row", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], mode: "cricket" }, stats.deep.modes[1]],
      },
    }],
    ["mode visits that do not reconcile", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], visits: 2 }, stats.deep.modes[1]],
      },
    }],
    ["mode darts that do not reconcile", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], dartsThrown: 4 }, stats.deep.modes[1]],
      },
    }],
    ["a headline bucket larger than all sessions", { ...stats, competitiveMatches: 3 }],
    ["overlapping competitive and practice headline buckets", { ...stats, practiceSessions: 2 }],
    ["a top-level win percentage that disagrees with results", { ...stats, winPercentage: 99 }],
    ["a non-zero win percentage without competitive results", {
      ...stats,
      competitiveMatches: 0,
      matchesWon: 0,
      winPercentage: 1,
      deep: null,
    }],
    ["a mode win percentage that disagrees with results", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], winPercentage: 99 }, stats.deep.modes[1]],
      },
    }],
    ["mode wins that disagree with the headline", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], won: 0, lost: 1, winPercentage: 0 }, stats.deep.modes[1]],
      },
    }],
    ["mode competitive results that disagree with the headline", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [{ ...stats.deep.modes[0], won: 0, lost: 0, unscored: 1, winPercentage: null }, stats.deep.modes[1]],
      },
    }],
    ["newest-first trend data", {
      ...stats,
      deep: {
        ...stats.deep,
        recentForm: [
          { completedAt: "2026-08-12T12:00:00.000Z", mode: "x01", result: "won" },
          { completedAt: "2026-08-11T12:00:00.000Z", mode: "x01", result: "lost" },
        ],
      },
    }],
    ["an incomplete competitive form window", {
      ...stats,
      deep: { ...stats.deep, recentForm: [] },
    }],
    ["an incomplete competitive X01 trend window", {
      ...stats,
      deep: { ...stats.deep, x01Trend: [] },
    }],
    ["a zero-hit finishing row", { ...stats, deep: { ...stats.deep, finishingBeds: [{ segment: 20, hits: 0, share: 0 }] } }],
    ["a missing drill", { ...stats, deep: { ...stats.deep, drills: stats.deep.drills.slice(0, 2) } }],
    ["checkout hits above attempts", {
      ...stats,
      deep: { ...stats.deep, checkoutsHit: 2, unattributedCheckouts: 1 },
    }],
    ["a checkout percentage that disagrees with hits", { ...stats, deep: { ...stats.deep, checkoutPercentage: 99 } }],
    ["checkout hits that do not reconcile", { ...stats, deep: { ...stats.deep, checkoutsHit: 2 } }],
    ["finishing shares that do not total one hundred", {
      ...stats,
      deep: { ...stats.deep, finishingBeds: [{ segment: 20, hits: 1, share: 90 }] },
    }],
    ["shares that do not match observed hits", {
      ...stats,
      deep: {
        ...stats.deep,
        checkoutsHit: 2,
        finishingBeds: [
          { segment: 20, hits: 1, share: 60 },
          { segment: 16, hits: 1, share: 40 },
        ],
      },
    }],
    ["a top-level X01 average above the physical maximum", { ...stats, threeDartAverage: 181 }],
    ["a first-nine average above the physical maximum", { ...stats, deep: { ...stats.deep, firstNineAverage: 181 } }],
    ["a best visit above the physical maximum", { ...stats, deep: { ...stats.deep, bestVisit: 181 } }],
    ["a trend average above the physical maximum", {
      ...stats,
      deep: {
        ...stats.deep,
        x01Trend: [{ ...stats.deep.x01Trend[0], threeDartAverage: 181 }],
      },
    }],
    ["a drill unit belonging to another mode", {
      ...stats,
      deep: {
        ...stats.deep,
        drills: [{ ...stats.deep.drills[0], unit: "points" }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["a latest drill value that is not the newest recent value", {
      ...stats,
      deep: {
        ...stats.deep,
        drills: [{ ...stats.deep.drills[0], latest: 7 }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["a drill best below its latest or recent value", {
      ...stats,
      deep: {
        ...stats.deep,
        drills: [{ ...stats.deep.drills[0], best: 7 }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["a drill average above its best", {
      ...stats,
      deep: {
        ...stats.deep,
        drills: [{ ...stats.deep.drills[0], average: 9 }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["drill sessions that disagree with their mode", {
      ...stats,
      deep: {
        ...stats.deep,
        drills: [{ ...stats.deep.drills[0], sessions: 2 }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["an incomplete drill recent window", {
      ...stats,
      matchesPlayed: 3,
      practiceSessions: 2,
      deep: {
        ...stats.deep,
        modes: [
          stats.deep.modes[0],
          { ...stats.deep.modes[1], played: 2, unscored: 2 },
        ],
        drills: [{ ...stats.deep.drills[0], sessions: 2 }, ...stats.deep.drills.slice(1)],
      },
    }],
    ["a drill mode recorded as competitive instead of unscored", {
      ...stats,
      deep: {
        ...stats.deep,
        modes: [
          stats.deep.modes[0],
          { ...stats.deep.modes[1], won: 1, unscored: 0, winPercentage: 100 },
        ],
      },
    }],
    ["practice sessions that disagree with drill totals", { ...stats, practiceSessions: 0 }],
  ])("rejects %s", async (_label, payload) => {
    await expect(fetchCareerStats({ fetcher: respond(200, payload) })).resolves.toBeNull();
  });

  it.each([
    ["checkoutLab", "checkouts", 13],
    ["doublesMatrix", "doubles", 22],
    ["scoringSprint", "points", 1_801],
  ] as const)("rejects an impossible %s session total", async (mode, unit, value) => {
    const drills = stats.deep.drills.map((drill) => {
      if (drill.mode === "checkoutLab") return {
        ...drill,
        mode,
        unit,
        latest: value,
        best: value,
        average: value,
        recent: [{ completedAt: "2026-08-12T12:00:00.000Z", value }],
      };
      if (mode !== "checkoutLab" && drill.mode === mode) {
        return { ...drill, mode: "checkoutLab", unit: "checkouts" };
      }
      return drill;
    });
    const modes = stats.deep.modes.map((entry) => entry.mode === "checkoutLab"
      ? { ...entry, mode }
      : entry);
    await expect(fetchCareerStats({
      fetcher: respond(200, { ...stats, deep: { ...stats.deep, modes, drills } }),
    })).resolves.toBeNull();
  });

  it("returns null for a refusal or unreachable service", async () => {
    await expect(fetchCareerStats({ fetcher: respond(401) })).resolves.toBeNull();
    const fetcher = (async () => { throw new TypeError("failed to fetch"); }) as typeof fetch;
    await expect(fetchCareerStats({ fetcher })).resolves.toBeNull();
  });
});

describe("reading one replay", () => {
  const match = {
    id: "match-1",
    completedAt: "2026-08-12T10:00:00.000Z",
    ownerSeat: 0,
    record: {
      mode: "x01",
      options: { startingScore: 40 },
      players: [{ seat: 0, displayName: "Player 1", isBot: false }],
      turns: [{
        seat: 0,
        turnNumber: 1,
        legNumber: 1,
        scoreBefore: 40,
        scoreAfter: 0,
        bust: false,
        dartsThrown: 1,
        darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
      }],
      winnerSeat: 0,
    },
  };

  it("returns a strict owner-visible match", async () => {
    await expect(fetchMatchReplay("match-1", { fetcher: respond(200, { match }) })).resolves.toEqual({ status: "ready", match });
  });

  it.each([
    [401, "signed-out"],
    [404, "not-found"],
    [500, "unavailable"],
  ] as const)("maps %i to %s", async (status, outcome) => {
    await expect(fetchMatchReplay("match-1", { fetcher: respond(status) })).resolves.toEqual({ status: outcome });
  });

  it("treats a malformed success as unavailable", async () => {
    await expect(fetchMatchReplay("match-1", { fetcher: respond(200, { match: { id: "match-1" } }) })).resolves.toEqual({ status: "unavailable" });
    await expect(fetchMatchReplay("match-1", {
      fetcher: respond(200, { match: { ...match, ownerSeat: 7 } }),
    })).resolves.toEqual({ status: "unavailable" });
  });

  it("encodes the path and treats network failure as unavailable", async () => {
    let path = "";
    const fetcher = (async (input: RequestInfo | URL) => {
      path = String(input);
      throw new TypeError("failed to fetch");
    }) as typeof fetch;
    await expect(fetchMatchReplay("match /1", { fetcher })).resolves.toEqual({ status: "unavailable" });
    expect(path).toBe("/api/matches/match%20%2F1");
  });
});
