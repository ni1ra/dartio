import { NextResponse } from "next/server";
import type { MatchReplayDetail } from "@/domain/match-replay";
import { requireCurrentUser } from "@/lib/server/auth";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError, readMatchReplay } from "@/lib/server/match-history";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * One completed match for its owner's read-only replay.
 *
 * Ownership is folded into the database query. A missing id and somebody else's id
 * consequently take the exact same response path, so this endpoint cannot be used
 * to enumerate another player's history.
 */
export interface MatchReplayRouteDependencies {
  readonly resolveUserId?: () => Promise<string>;
  readonly read?: (userId: string, matchId: string) => Promise<MatchReplayDetail | null>;
}

export async function handleMatchReplayRequest(
  matchId: string,
  dependencies: MatchReplayRouteDependencies = {},
): Promise<Response> {
  try {
    const userId = await (dependencies.resolveUserId ?? currentUserId)();
    const read = dependencies.read ?? readMatchReplay;
    const match = await read(userId, matchId);
    if (!match) {
      return NextResponse.json({ error: "match_not_found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ match }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401, headers: NO_STORE });
    }
    if (error instanceof AuthServiceError || error instanceof MatchHistoryError) {
      return NextResponse.json({ error: "match_history_unavailable" }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: "match_replay_failed" }, { status: 500, headers: NO_STORE });
  }
}

async function currentUserId(): Promise<string> {
  return (await requireCurrentUser()).id;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleMatchReplayRequest((await context.params).id);
}
