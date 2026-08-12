import { NextResponse } from "next/server";
import { careerStats, type CareerStats, type StatMatch } from "@/domain/match-stats";
import { getAccessForUser, type AccessSnapshot } from "@/lib/server/access";
import { requireCurrentUser } from "@/lib/server/auth";
import { safeEntitlementError } from "@/lib/server/entitlements";
import { MatchHistoryError, readStatMatches } from "@/lib/server/match-history";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * What the player's own matches say about how they play.
 *
 * The split between free and paid is the catalogue's, not this route's invention:
 * Free carries a 50-match history window and no `deep_stats`, Pro and Club carry
 * neither limit. So everyone gets the headline — matches, wins, three-dart average
 * — and the numbers a player would actually train against are the paid ones.
 *
 * It is computed and withheld on the server. A locked response does not contain the
 * deep figures at all, rather than shipping them and hiding them behind a blur,
 * because a client that renders a lock is not a client that enforces one.
 */
export interface StatsResponse {
  readonly matchesPlayed: number;
  readonly competitiveMatches: number;
  readonly practiceSessions: number;
  readonly matchesWon: number;
  readonly winPercentage: number;
  readonly visits: number;
  readonly dartsThrown: number;
  readonly threeDartAverage: number;
  /** How far back this plan can see. Null is unlimited. */
  readonly historyLimit: number | null;
  readonly deep: DeepStats | null;
}

export interface DeepStats {
  readonly x01Matches: number;
  readonly firstNineAverage: number;
  readonly checkoutAttempts: number;
  readonly checkoutsHit: number;
  readonly checkoutPercentage: number;
  readonly bestVisit: number;
  readonly bestLegDarts: number | null;
  readonly busts: number;
  readonly finishingBeds: CareerStats["x01"]["finishingBeds"];
  /** Aggregate and exact non-double finishes both belong here, never in an invented bed. */
  readonly unattributedCheckouts: number;
  readonly recentForm: CareerStats["recentForm"];
  readonly x01Trend: CareerStats["x01"]["trend"];
  readonly modes: CareerStats["modes"];
  readonly drills: CareerStats["drills"];
}

export interface StatsRouteDependencies {
  readonly resolveAccess?: () => Promise<{ userId: string; access: AccessSnapshot }>;
  readonly read?: (userId: string, limit: number | null) => Promise<readonly StatMatch[]>;
}

export function statsResponse(stats: CareerStats, access: AccessSnapshot): StatsResponse {
  const entitled = access.entitlements.includes("deep_stats");
  return {
    matchesPlayed: stats.matchesPlayed,
    competitiveMatches: stats.competitiveMatches,
    practiceSessions: stats.practiceSessions,
    matchesWon: stats.matchesWon,
    winPercentage: stats.winPercentage,
    visits: stats.visits,
    dartsThrown: stats.dartsThrown,
    threeDartAverage: stats.x01.threeDartAverage,
    historyLimit: access.limits.historyMatches,
    deep: entitled
      ? {
        x01Matches: stats.x01.matches,
        firstNineAverage: stats.x01.firstNineAverage,
        checkoutAttempts: stats.x01.checkoutAttempts,
        checkoutsHit: stats.x01.checkoutsHit,
        checkoutPercentage: stats.x01.checkoutPercentage,
        bestVisit: stats.x01.bestVisit,
        bestLegDarts: stats.x01.bestLegDarts,
        busts: stats.x01.busts,
        finishingBeds: stats.x01.finishingBeds,
        unattributedCheckouts: stats.x01.unattributedCheckouts,
        recentForm: stats.recentForm,
        x01Trend: stats.x01.trend,
        modes: stats.modes,
        drills: stats.drills,
      }
      : null,
  };
}

export async function handleStatsRequest(dependencies: StatsRouteDependencies = {}): Promise<Response> {
  try {
    const resolve = dependencies.resolveAccess ?? currentAccess;
    const { userId, access } = await resolve();
    const read = dependencies.read ?? readStatMatches;
    const stats = careerStats(await read(userId, access.limits.historyMatches));
    return NextResponse.json(statsResponse(stats, access), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof MatchHistoryError) {
      return NextResponse.json({ error: "match_history_unavailable" }, { status: 503, headers: NO_STORE });
    }
    const { status, body } = safeEntitlementError(error, "stats_failed");
    return NextResponse.json(body, { status, headers: NO_STORE });
  }
}

async function currentAccess(): Promise<{ userId: string; access: AccessSnapshot }> {
  const user = await requireCurrentUser();
  return { userId: user.id, access: await getAccessForUser(user) };
}

export async function GET(): Promise<Response> {
  return handleStatsRequest();
}
