import { describe, expect, it } from "vitest";
import { representativePoint } from "./darts";
import type { MatchRecord } from "./match-record";
import { buildMatchReplayTimeline } from "./match-replay";
import { GAME_MODES } from "./modes";

const BASE_RECORD: MatchRecord = {
  mode: "future-mode",
  options: { rulesOnlyThatModeKnows: true },
  players: [
    { seat: 0, displayName: "Player 1", isBot: false },
    { seat: 1, displayName: "Player 2", isBot: false },
  ],
  turns: [
    {
      seat: 0,
      turnNumber: 1,
      legNumber: 1,
      scoreBefore: 501,
      scoreAfter: 401,
      bust: false,
      dartsThrown: 2,
      darts: [
        { ordinal: 2, segment: 20, multiplier: 2, x: 0.25, y: -0.5 },
        { ordinal: 1, segment: 20, multiplier: 3 },
      ],
    },
  ],
};

describe("generic stored-match replay", () => {
  it.each([...Object.keys(GAME_MODES), "future-mode"])('replays mode id "%s" through the same builder', (mode) => {
    const frames = buildMatchReplayTimeline({ ...BASE_RECORD, mode });
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.landing.kind)).toEqual(["dart", "dart"]);
  });

  it("sorts visits and exact darts without learning a mode's rules", () => {
    const laterTurn = {
      ...BASE_RECORD.turns[0]!,
      seat: 1,
      turnNumber: 2,
      scoreBefore: 300,
      scoreAfter: 240,
      dartsThrown: 1 as const,
      darts: [{ ordinal: 1 as const, segment: 20, multiplier: 3 as const }],
    };
    const frames = buildMatchReplayTimeline({ ...BASE_RECORD, turns: [laterTurn, BASE_RECORD.turns[0]!] });

    expect(frames.map(({ turnNumber, ordinal }) => [turnNumber, ordinal])).toEqual([[1, 1], [1, 2], [2, 1]]);
    expect(frames[0]).toMatchObject({ frameNumber: 1, seat: 0, scoreBefore: 501, scoreAfter: null, bust: null, turnComplete: false });
    expect(frames[1]).toMatchObject({ frameNumber: 2, scoreAfter: 401, bust: false, turnComplete: true });
  });

  it("uses a recorded impact point and labels a bed-only point as representative", () => {
    const frames = buildMatchReplayTimeline(BASE_RECORD);
    const treble = representativePoint({ segment: 20, multiplier: 3 });

    expect(frames[0]?.landing).toEqual({
      kind: "dart",
      segment: 20,
      multiplier: 3,
      notation: "T20",
      score: 60,
      ...treble,
      coordinateSource: "representative",
    });
    expect(frames[1]?.landing).toMatchObject({ kind: "dart", notation: "D20", x: 0.25, y: -0.5, coordinateSource: "recorded" });
  });

  it("creates marker-free unknown landings for every declared aggregate dart", () => {
    const aggregate: MatchRecord = {
      ...BASE_RECORD,
      turns: [{
        seat: 0,
        turnNumber: 4,
        legNumber: 2,
        scoreBefore: 501,
        scoreAfter: 441,
        bust: false,
        dartsThrown: 3,
        aggregateScore: 60,
        darts: [],
      }],
    };
    const frames = buildMatchReplayTimeline(aggregate);

    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.landing)).toEqual(Array.from({ length: 3 }, () => ({ kind: "unknown", visitAggregateScore: 60 })));
    expect(frames.map((frame) => frame.scoreAfter)).toEqual([null, null, 441]);
    expect(frames.every((frame) => !("x" in frame.landing) && !("segment" in frame.landing))).toBe(true);
  });

  it("reveals a bust only when its final result is known", () => {
    const frames = buildMatchReplayTimeline({
      ...BASE_RECORD,
      turns: [{ ...BASE_RECORD.turns[0]!, bust: true, scoreAfter: 501 }],
    });
    expect(frames.map((frame) => frame.bust)).toEqual([null, true]);
    expect(frames.map((frame) => frame.scoreAfter)).toEqual([null, 501]);
  });

  it("has no synthetic opening frame when there are no stored darts", () => {
    expect(buildMatchReplayTimeline({ ...BASE_RECORD, turns: [] })).toEqual([]);
  });
});
