import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultAuthorize, roomErrorResponse } from "../../route";
import { completeRoomMatch } from "@/lib/server/rooms";
import { MAX_PLAYERS } from "@/domain/match-record";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Closing a room's match.
 *
 * Both players replay the same log and both see the same finish, so both will call
 * this. The second call is agreement rather than a conflict, and answers 200 with
 * `alreadyComplete` rather than an error — a client should not have to race to be
 * the one who reports a result they both already know.
 */
const bodySchema = z.object({
  winnerSeat: z.number().int().min(0).max(MAX_PLAYERS - 1).nullable(),
}).strict();

export interface CompleteRoomDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly complete?: (userId: string, code: string, winnerSeat: number | null) => Promise<{ alreadyComplete: boolean }>;
}

export async function handleCompleteRoomRequest(
  request: Request,
  code: string,
  dependencies: CompleteRoomDependencies = {},
): Promise<Response> {
  try {
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId } = await authorize();
    const body = bodySchema.parse(await request.json());
    const complete = dependencies.complete ?? completeRoomMatch;
    return NextResponse.json(await complete(userId, code, body.winnerSeat), { headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_complete_failed");
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleCompleteRoomRequest(request, (await context.params).code);
}
