import { describe, expect, it } from "vitest";
import { accessSnapshot, type AccessSnapshot } from "./access";
import { CheckoutAdviceAccessError, generateAuthorizedCheckoutAdvice } from "./checkout-advice";

const input = { score: 141, dartsAvailable: 3, outRule: "double", preferences: {} } as const;

const paid = (): AccessSnapshot => accessSnapshot(true, {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
}, new Date("2029-01-01T00:00:00.000Z"));

describe("generateAuthorizedCheckoutAdvice", () => {
  it("plans alternates and setup routes for an entitled subscriber", () => {
    const advice = generateAuthorizedCheckoutAdvice(input, paid());
    expect(advice.checkout).toBe(true);
    expect(advice.alternatePlans.length).toBeGreaterThan(0);
  });

  it("refuses an anonymous visitor before planning", () => {
    expect(() => generateAuthorizedCheckoutAdvice(input, accessSnapshot(false, null)))
      .toThrow(new CheckoutAdviceAccessError(401, "authentication_required"));
  });

  it("refuses an authenticated Free player", () => {
    expect(() => generateAuthorizedCheckoutAdvice(input, accessSnapshot(true, null)))
      .toThrow(new CheckoutAdviceAccessError(403, "advanced_checkout_required"));
  });

  it("refuses an entitled plan whose feature has not shipped", () => {
    const unshipped: AccessSnapshot = {
      ...paid(),
      availability: { ...paid().availability, advancedCheckout: "coming_soon" },
    };
    expect(() => generateAuthorizedCheckoutAdvice(input, unshipped))
      .toThrow(new CheckoutAdviceAccessError(403, "advanced_checkout_required"));
  });

  it("carries server-derived preferences into the plan", () => {
    const advice = generateAuthorizedCheckoutAdvice(
      { ...input, score: 40, preferences: { preferredDoubles: [10] } },
      paid(),
    );
    expect(advice.primaryPlan?.darts.at(-1)).toMatchObject({ segment: 10, multiplier: 2 });
  });
});
