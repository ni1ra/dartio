export const GAME_MODES = {
  x01: { name: "X01", status: "playable", options: ["startingScore", "legsToWin", "setsToWin", "inRule", "outRule"] },
  cricket: { name: "Cricket", status: "playable", options: ["variant", "winByTwo", "roundLimit"] },
  aroundTheClock: { name: "Around the Clock", status: "playable", options: ["targetOrder", "bullFinish"] },
  shanghai: { name: "Shanghai", status: "playable", options: ["rounds", "instantShanghaiWin"] },
  countUp: { name: "Count-Up", status: "playable", options: ["rounds"] },
  bobs27: { name: "Bob's 27", status: "playable", options: ["startingScore"] },
  checkoutPractice: { name: "Checkout Practice", status: "specified", options: ["range", "attempts"] },
  doublesPractice: { name: "Doubles Practice", status: "specified", options: ["targetOrder", "attempts"] },
  scoringPractice: { name: "Scoring Practice", status: "specified", options: ["rounds", "target"] },
} as const;

export type GameModeId = keyof typeof GAME_MODES;

/**
 * The player-facing name for a stored mode id.
 *
 * History reads mode ids back out of the database, where they are plain text and
 * may outlive the catalogue — a mode removed from this list still has matches in
 * somebody's record. Falling back to the id keeps that row readable instead of
 * blank.
 */
export function modeName(id: string): string {
  return (GAME_MODES as Record<string, { readonly name: string } | undefined>)[id]?.name ?? id;
}
