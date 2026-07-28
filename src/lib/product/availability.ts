// Implementation status only. This map never grants access; paid consumption
// must be authorized independently from the snapshot's entitlements.
export const PRODUCT_AVAILABILITY = {
  localScoring: "implemented",
  advancedAi: "implemented",
  advancedCheckout: "implemented",
  voiceInput: "implemented",
  history: "coming_soon",
  deepStats: "coming_soon",
  onlineMultiplayer: "coming_soon",
  customPractice: "coming_soon",
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
