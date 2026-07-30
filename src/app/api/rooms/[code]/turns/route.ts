import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultAuthorize, roomErrorResponse } from "../../route";
import { appendRoomTurn, type AppendTurnInput } from "@/lib/server/rooms";
import { MAX_PLAYERS, MAX_TURNS } from "@/domain/match-record";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Filing one visit into a shared room.
 *
 * `expectedVersion` is the whole contract. A client says which version it is
 * extending; if somebody else already extended that one, this is refused with a
 * conflict rather than accepted into an order nobody agreed to. The turn number is
 * never sent — the server assigns it, because that is the thing it is authoritative
 * over.
 *
 * The darts are validated against the same board the `darts` constraints enforce,
 * for the same reason history is: shape is checkable without knowing the rules.
 */
const dartSchema = z.object({
  ordinal: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  segment: z.number().int().min(0).max(25),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
}).strict().refine(
  (d) => (d.segment === 0 ? d.multiplier === 1 : d.segment === 25 ? d.multiplier !== 3 : d.segment <= 20),
  "Impossible bed and multiplier",
);

const bodySchema = z.object({
  expectedVersion: z.number().int().min(0).max(MAX_TURNS),
  seat: z.number().int().min(0).max(MAX_PLAYERS - 1),
  turn: z.object({
    legNumber: z.number().int().min(1).max(MAX_TURNS),
    scoreBefore: z.number().int().min(-9999).max(9999),
    scoreAfter: z.number().int().min(-9999).max(9999),
    bust: z.boolean(),
    dartsThrown: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    aggregateScore: z.number().int().min(0).max(180).optional(),
    darts: z.array(dartSchema).max(3),
  }).strict().refine(
    (t) => t.darts.length === 0 || t.darts.length === t.dartsThrown,
    "A visit recorded dart by dart must record every dart it threw",
  ),
}).strict();

export interface RoomTurnDependencies {
  readonly authorize?: () => Promise<{ userId: string; displayName: string }>;
  readonly append?: (userId: string, code: string, input: AppendTurnInput) => Promise<{ version: number }>;
}

export async function handleRoomTurnRequest(
  request: Request,
  code: string,
  dependencies: RoomTurnDependencies = {},
): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());
    const authorize = dependencies.authorize ?? defaultAuthorize;
    const { userId } = await authorize();
    const append = dependencies.append ?? appendRoomTurn;
    const result = await append(userId, code, body as AppendTurnInput);
    return NextResponse.json(result, { status: 201, headers: NO_STORE });
  } catch (error) {
    return roomErrorResponse(error, "room_turn_failed");
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  return handleRoomTurnRequest(request, (await context.params).code);
}
