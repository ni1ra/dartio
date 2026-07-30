import { NextResponse } from "next/server";
import { z } from "zod";
import { GAME_MODES } from "@/domain/modes";
import { requireEntitlement, safeEntitlementError } from "@/lib/server/entitlements";
import { createRoom, RoomError, RoomServiceError, type RoomSeatResult } from "@/lib/server/rooms";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Opening a room.
 *
 * Online play is `online_multiplayer` in the catalogue and Free carries zero online
 * seats, so the entitlement is checked here before a room can exist — not on the
 * button that opens it. The name on the seat comes from the player's own profile,
 * never from the request: it is shown to everybody else in the room, and a client
 * that could choose it could sit down as somebody else.
 */
const bodySchema = z.object({
  mode: z.string().min(1).max(32).refine((mode) => mode in GAME_MODES, "Unknown mode"),
  options: z.record(z.string(), z.unknown()).default({}),
}).strict();

export interface CreateRoomDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly create?: (userId: string, input: { mode: string; options: Record<string, unknown>; displayName: string }) => Promise<RoomSeatResult>;
}

export async function handleCreateRoomRequest(
  request: Request,
  dependencies: CreateRoomDependencies = {},
): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId, displayName } = await authorize();
    const create = dependencies.create ?? createRoom;
    const room = await create(userId, { ...body, displayName });
    return NextResponse.json(room, { status: 201, headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_not_created");
  }
}

export async function defaultAuthorize(): Promise<{ userId: string; displayName: string }> {
  const { user } = await requireEntitlement("online_multiplayer");
  return { userId: user.id, displayName: user.profile.displayName };
}

export function roomErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "invalid_room_request" }, { status: 400, headers: NO_STORE });
  }
  if (error instanceof RoomError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: NO_STORE });
  }
  if (error instanceof RoomServiceError) {
    return NextResponse.json({ error: "rooms_unavailable" }, { status: 503, headers: NO_STORE });
  }
  const { status, body } = safeEntitlementError(error, fallback);
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  return handleCreateRoomRequest(request);
}
