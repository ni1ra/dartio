import { NextResponse } from "next/server";
import { defaultAuthorize, roomErrorResponse } from "../route";
import { joinRoom, readRoom, type RoomSeatResult, type RoomState } from "@/lib/server/rooms";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Reading a room, and taking a seat in one.
 *
 * `since` is how a client stays current without re-reading a whole match every few
 * seconds: it sends the last version it holds and gets only what arrived after it.
 * The version is the server's own count of accepted writes, so a client that has
 * seen version 14 is asking a question the server can answer exactly.
 */
export interface RoomRouteDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly read?: (userId: string, code: string, since: number) => Promise<RoomState>;
  readonly join?: (userId: string, code: string, displayName: string) => Promise<RoomSeatResult>;
}

export async function handleReadRoomRequest(
  request: Request,
  code: string,
  dependencies: RoomRouteDependencies = {},
): Promise<Response> {
  try {
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId } = await authorize();
    const read = dependencies.read ?? readRoom;
    const state = await read(userId, code, parseSince(new URL(request.url).searchParams.get("since")));
    return NextResponse.json(state, { headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_read_failed");
  }
}

export async function handleJoinRoomRequest(
  _request: Request,
  code: string,
  dependencies: RoomRouteDependencies = {},
): Promise<Response> {
  try {
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId, displayName } = await authorize();
    const join = dependencies.join ?? joinRoom;
    return NextResponse.json(await join(userId, code, displayName), { status: 200, headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_join_failed");
  }
}

/** An unreadable `since` means "I have nothing", which is the safe answer: send everything. */
function parseSince(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleReadRoomRequest(request, (await context.params).code);
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleJoinRoomRequest(request, (await context.params).code);
}
