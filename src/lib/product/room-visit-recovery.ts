import type { FiledTurn, RoomStateView, RoomTurnView } from "./rooms-client";

export interface HeldRoomVisit {
  readonly expectedVersion: number;
  readonly seat: number;
  readonly turn: FiledTurn["turn"];
}

export type RoomVisitResolution =
  | "accepted"
  | "retryable"
  | "superseded"
  | "closed"
  | "stale";

/**
 * Reconciles an outcome-unknown POST against one full authoritative room read.
 * The server's expected-version write stays the referee; this helper only says
 * whether the exact visit is already there or whether the original claim is
 * still available for one explicit retry.
 */
export function reconcileHeldRoomVisit(
  room: RoomStateView,
  held: HeldRoomVisit,
): RoomVisitResolution {
  if (room.version < held.expectedVersion) return "stale";

  const claimedTurn = room.turns.find((turn) => turn.version === held.expectedVersion + 1);
  if (claimedTurn && sameRoomTurn(claimedTurn, held)) return "accepted";

  if (room.status === "complete" || room.status === "abandoned") return "closed";
  if (room.version === held.expectedVersion) return "retryable";
  return "superseded";
}

/** Exact stored fields only; coordinates are display evidence and are not echoed by room reads. */
function sameRoomTurn(stored: RoomTurnView, held: HeldRoomVisit): boolean {
  const expected = held.turn;
  return stored.turnNumber === held.expectedVersion + 1
    && stored.seat === held.seat
    && stored.legNumber === expected.legNumber
    && stored.scoreBefore === expected.scoreBefore
    && stored.scoreAfter === expected.scoreAfter
    && stored.bust === expected.bust
    && stored.dartsThrown === expected.dartsThrown
    && stored.aggregateScore === expected.aggregateScore
    && stored.darts.length === expected.darts.length
    && stored.darts.every((dart, index) => {
      const candidate = expected.darts[index];
      return candidate !== undefined
        && dart.ordinal === candidate.ordinal
        && dart.segment === candidate.segment
        && dart.multiplier === candidate.multiplier;
    });
}
