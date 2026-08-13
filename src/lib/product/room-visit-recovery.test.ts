import { describe, expect, it } from "vitest";
import type { FiledTurn, RoomStateView } from "./rooms-client";
import { reconcileHeldRoomVisit, type HeldRoomVisit } from "./room-visit-recovery";

const turn: FiledTurn["turn"] = {
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
};
const held: HeldRoomVisit = { expectedVersion: 0, seat: 0, turn };

function room(overrides: Partial<RoomStateView> = {}): RoomStateView {
  return {
    code: "OCHE42",
    mode: "x01",
    options: {},
    status: "active",
    version: 0,
    yourSeat: 0,
    yourRole: "owner",
    watching: 0,
    seats: [
      { seat: 0, displayName: "Host", isYou: true, role: "owner" },
      { seat: 1, displayName: "Guest", isYou: false, role: "player" },
    ],
    turns: [],
    ...overrides,
  };
}

const storedTurn: RoomStateView["turns"][number] = {
  version: 1,
  turnNumber: 1,
  seat: 0,
  legNumber: turn.legNumber,
  scoreBefore: turn.scoreBefore,
  scoreAfter: turn.scoreAfter,
  bust: turn.bust,
  dartsThrown: turn.dartsThrown,
  darts: turn.darts.map(({ ordinal, segment, multiplier }) => ({ ordinal, segment, multiplier })),
};

describe("outcome-unknown room visits", () => {
  it("confirms the exact visit after its response was lost", () => {
    expect(reconcileHeldRoomVisit(room({ version: 1, turns: [storedTurn] }), held)).toBe("accepted");
  });

  it("permits retry only while the original live version is unchanged", () => {
    expect(reconcileHeldRoomVisit(room(), held)).toBe("retryable");
  });

  it.each([
    { seat: 1 },
    { scoreAfter: 481 },
    { darts: [{ ordinal: 1 as const, segment: 20, multiplier: 3 as const }] },
  ])("does not mistake another accepted turn for this visit: %#", (change) => {
    expect(reconcileHeldRoomVisit(room({
      version: 1,
      turns: [{ ...storedTurn, ...change }],
    }), held)).toBe("superseded");
  });

  it.each(["complete", "abandoned"] as const)("lets terminal %s refuse an unaccepted visit", (status) => {
    expect(reconcileHeldRoomVisit(room({ status }), held)).toBe("closed");
  });

  it("rejects a read older than the version the visit extended", () => {
    expect(reconcileHeldRoomVisit(room({ version: 1 }), { ...held, expectedVersion: 2 })).toBe("stale");
  });

  it("still confirms an accepted visit when close wins immediately afterwards", () => {
    expect(reconcileHeldRoomVisit(room({ status: "abandoned", version: 1, turns: [storedTurn] }), held)).toBe("accepted");
  });
});
