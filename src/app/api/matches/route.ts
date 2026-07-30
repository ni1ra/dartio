import { NextResponse } from "next/server";
import { z } from "zod";
import { matchRecordSchema, type MatchRecord } from "@/domain/match-record";
import { requireCurrentUser } from "@/lib/server/auth";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import {
  HISTORY_PAGE_SIZE,
  listMatches,
  MatchHistoryError,
  recordMatch,
  type MatchHistoryEntry,
} from "@/lib/server/match-history";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * A player's own match history.
 *
 * The record is built on the device, because only the device knows which mode was
 * played and each mode owns its own log — a server that understood all six would
 * have to be edited to add a seventh. What the server does not take on trust is the
 * shape or the owner: the record is validated bed by bed against the same board the
 * database enforces, and the account it is filed under comes from the session.
 *
 * This is history, not officiating. Room play is server-authoritative and lands
 * separately; nothing here decides a result anybody else is bound by.
 */
const bodySchema = z.object({
  record: matchRecordSchema,
  /** Which seat the requester occupied. Everything else is a local opponent or a bot. */
  ownerSeat: z.number().int().min(0).max(7).default(0),
}).strict().superRefine((body, ctx) => {
  const seat = body.record.players.find((player) => player.seat === body.ownerSeat);
  if (!seat) {
    ctx.addIssue({ code: "custom", message: "You cannot file a match into a seat nobody played" });
    return;
  }
  if (seat.isBot) {
    ctx.addIssue({ code: "custom", message: "A bot's seat is not yours to claim" });
  }
});

export interface MatchRouteDependencies {
  readonly resolveUserId?: () => Promise<string>;
  readonly record?: (userId: string, record: MatchRecord, ownerSeat: number) => Promise<string>;
  readonly list?: (userId: string, limit: number) => Promise<readonly MatchHistoryEntry[]>;
}

export async function handleRecordMatchRequest(
  request: Request,
  dependencies: MatchRouteDependencies = {},
): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());
    const userId = await (dependencies.resolveUserId ?? currentUserId)();
    const write = dependencies.record ?? recordMatch;
    const id = await write(userId, body.record as MatchRecord, body.ownerSeat);
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "match_not_recorded");
  }
}

export async function handleMatchHistoryRequest(
  request: Request,
  dependencies: MatchRouteDependencies = {},
): Promise<Response> {
  try {
    const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
    const userId = await (dependencies.resolveUserId ?? currentUserId)();
    const read = dependencies.list ?? listMatches;
    return NextResponse.json({ matches: await read(userId, limit) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "match_history_failed");
  }
}

/** Out-of-range or unparsable limits fall back to the page size rather than rejecting the request. */
function parseLimit(raw: string | null): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return HISTORY_PAGE_SIZE;
  return Math.min(parsed, HISTORY_PAGE_SIZE * 5);
}

async function currentUserId(): Promise<string> {
  return (await requireCurrentUser()).id;
}

function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "invalid_match_record" }, { status: 400, headers: NO_STORE });
  }
  if (error instanceof AuthError) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401, headers: NO_STORE });
  }
  if (error instanceof AuthServiceError || error instanceof MatchHistoryError) {
    return NextResponse.json({ error: "match_history_unavailable" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ error: fallback }, { status: 500, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  return handleRecordMatchRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMatchHistoryRequest(request);
}
