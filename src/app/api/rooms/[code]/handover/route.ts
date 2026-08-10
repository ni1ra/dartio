import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultAuthorize, roomErrorResponse } from "../../route";
import { handOverRoom } from "@/lib/server/rooms";
import { MAX_PLAYERS } from "@/domain/match-record";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Handing the room to another seated player.
 *
 * Host-departure semantics are deliberate: a room outlives presence — closing a
 * tab abandons nothing, the TTL bounds every room's life — so departure needs no
 * event. What a leaving host does is hand over first; this is that verb, and it is
 * the host's alone.
 */
const bodySchema = z.object({
  toSeat: z.number().int().min(0).max(MAX_PLAYERS - 1),
}).strict();

export interface HandOverRoomDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly handOver?: (userId: string, code: string, toSeat: number) => Promise<{ code: string; hostSeat: number }>;
}

export async function handleHandOverRoomRequest(
  request: Request,
  code: string,
  dependencies: HandOverRoomDependencies = {},
): Promise<Response> {
  try {
    // Authorized before the body is read, like every other room write.
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId } = await authorize();
    const body = bodySchema.parse(await request.json());
    const handOver = dependencies.handOver ?? handOverRoom;
    return NextResponse.json(await handOver(userId, code, body.toSeat), { headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_handover_failed");
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleHandOverRoomRequest(request, (await context.params).code);
}
