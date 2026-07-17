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

export type ProductAvailability = typeof PRODUCT_AVAILABILITY;
