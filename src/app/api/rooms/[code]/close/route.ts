import { NextResponse } from "next/server";
import { defaultAuthorize, roomErrorResponse } from "../../route";
import { closeRoom } from "@/lib/server/rooms";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The host closes the room.
 *
 * Distinct from `/complete` on purpose: completion reports a finish both players
 * already replayed, is seat-authorized, and names a winner; closing abandons a
 * match that never finished, is host-authorized, and names nobody. Folding them
 * into one route would blur the only two ways a room ends.
 *
 * No body: there is nothing to decide beyond the authority to decide it.
 */
export interface CloseRoomDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly close?: (userId: string, code: string) => Promise<{ alreadyClosed: boolean }>;
}

export async function handleCloseRoomRequest(
  _request: Request,
  code: string,
  dependencies: CloseRoomDependencies = {},
): Promise<Response> {
  try {
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId } = await authorize();
    const close = dependencies.close ?? closeRoom;
    return NextResponse.json(await close(userId, code), { headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_close_failed");
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleCloseRoomRequest(request, (await context.params).code);
}
