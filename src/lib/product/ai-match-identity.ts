import type { SeatIdentity } from "@/domain/match-record";

/**
 * Describes the opponent without inventing one level for a match that changed it.
 *
 * The stored execution levels survive reload and distinguish a pure level-eight
 * fallback from a premium-to-local match. The history schema has one level slot,
 * so omission is the only honest value when more than one level actually threw.
 */
export function opponentSeatIdentity(
  isAi: boolean,
  configuredLevel: number,
  levelsUsed: readonly number[],
): SeatIdentity {
  if (!isAi) return { isBot: false };
  const distinct = [...new Set(levelsUsed)];
  const botLevel = distinct.length === 0
    ? configuredLevel
    : distinct.length === 1
      ? distinct[0]
      : undefined;
  return {
    isBot: true,
    ...(botLevel === undefined ? {} : { botLevel }),
  };
}
