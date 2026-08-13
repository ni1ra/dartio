/** Aggregate evidence returned after the player explicitly enables history use. */
export type CheckoutPersonalizationStatus = "off" | "sparse" | "applied" | "unavailable";

export interface CheckoutPersonalizationReceipt {
  readonly status: CheckoutPersonalizationStatus;
  readonly x01Matches: number;
  readonly exactDarts: number;
  readonly finishingDoubles: number;
}
