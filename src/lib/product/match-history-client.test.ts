import { describe, expect, it } from "vitest";
import type { MatchRecord } from "@/domain/match-record";
import { fetchMatchHistory, recordCompletedMatch } from "./match-history-client";

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
