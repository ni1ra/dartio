import { describe, expect, it } from "vitest";
import { readRoom } from "./rooms-client";

const room = {
  code: "OCHE42",
  mode: "x01",
  options: { startingScore: 501 },
  status: "active",
  version: 1,
  yourSeat: 0,
  yourRole: "owner",
  watching: 0,
  seats: [
    { seat: 0, displayName: "Host", isYou: true, role: "owner" },
    { seat: 1, displayName: "Guest", isYou: false, role: "player" },
  ],
  turns: [{
    version: 1,
    turnNumber: 1,
    seat: 0,
    legNumber: 1,
    scoreBefore: 501,
    scoreAfter: 441,
    bust: false,
    dartsThrown: 3,
    darts: [
      { ordinal: 1, segment: 20, multiplier: 1 },
      { ordinal: 2, segment: 20, multiplier: 1 },
      { ordinal: 3, segment: 20, multiplier: 1 },
    ],
  }],
};

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
});

describe("room read boundary", () => {
  it("keeps the exact stored visit fields needed for outcome reconciliation", async () => {
    const result = await readRoom("OCHE42", 0, {
      fetcher: async () => response({ ...room, additiveServerField: true }),
    });

    expect(result).toEqual({ ok: true, value: room });
  });

  it("fails closed when a turn lacks its authoritative version identity", async () => {
    const turnWithoutVersion = Object.fromEntries(
      Object.entries(room.turns[0]!).filter(([key]) => key !== "version"),
    );
    const result = await readRoom("OCHE42", 0, {
      fetcher: async () => response({ ...room, turns: [turnWithoutVersion] }),
    });

    expect(result).toEqual({ ok: false, failure: "rooms_unavailable" });
  });

  it("maps a transport failure to the recoverable room failure", async () => {
    const result = await readRoom("OCHE42", 0, {
      fetcher: async () => { throw new TypeError("connection lost"); },
    });

    expect(result).toEqual({ ok: false, failure: "rooms_unavailable" });
  });
});
