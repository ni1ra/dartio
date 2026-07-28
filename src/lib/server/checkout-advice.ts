import { checkoutAdvice, type CheckoutAdvice, type CheckoutPreferences, type OutRule } from "@/domain";
import type { AccessSnapshot } from "./access";

/**
 * Server-authorized advanced checkout planning.
 *
 * Free players get `basicCheckoutAdvice` computed locally: one ranked route.
 * Alternate routes, setup-visit plans, and preference-driven ranking are the
 * paid `advanced_checkout` entitlement, so they are produced here — behind a
 * verified access snapshot — and never derived from anything the client claims.
 */
export interface AdvancedCheckoutInput {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly outRule: OutRule;
  readonly preferences: CheckoutPreferences;
}

export type CheckoutAdviceAccessCode = "authentication_required" | "advanced_checkout_required";

export class CheckoutAdviceAccessError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: CheckoutAdviceAccessCode,
  ) {
    super(code);
    this.name = "CheckoutAdviceAccessError";
  }
}

export function generateAuthorizedCheckoutAdvice(
  input: AdvancedCheckoutInput,
  access: AccessSnapshot,
): CheckoutAdvice {
  if (access.auth === "anonymous") {
    throw new CheckoutAdviceAccessError(401, "authentication_required");
  }
  // Availability is checked alongside the entitlement: a plan may grant a
  // feature the product has not shipped, and that must not read as authorized.
  if (
    !access.entitlements.includes("advanced_checkout")
    || access.availability.advancedCheckout !== "implemented"
  ) {
    throw new CheckoutAdviceAccessError(403, "advanced_checkout_required");
  }
  return checkoutAdvice(input.score, input.dartsAvailable, input.outRule, input.preferences);
}
