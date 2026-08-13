// Implementation status only. This map never grants access; paid consumption
// must be authorized independently from the snapshot's entitlements.
export const PRODUCT_AVAILABILITY = {
  localScoring: "implemented",
  advancedAi: "implemented",
  advancedCheckout: "implemented",
  voiceInput: "implemented",
  history: "implemented",
  deepStats: "implemented",
  // Flipped in Cycle 24: create, join, play, reconnect, spectate, handover, and
  // close are all live and production-verified. Held deliberately from Cycle 15
  // until the whole /friends promise was true rather than half of it.
  onlineMultiplayer: "implemented",
  // A small user-defined bed sequence is live; this does not imply a generic
  // drill language or Club-authored programmes.
  customPractice: "implemented",
  clubManagement: "coming_soon",
} as const;

export type AvailabilityState = "implemented" | "coming_soon";

/**
 * Deliberately wider than `typeof PRODUCT_AVAILABILITY`. Snapshots carry
 * availability as data that changes when a feature ships, so consumers must be
 * able to branch on either state — narrowing to today's literals would make an
 * unshipped-feature check look like dead code and invite its removal.
 */
export type ProductAvailability = Record<keyof typeof PRODUCT_AVAILABILITY, AvailabilityState>;
