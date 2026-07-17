import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  canonicalAppOrigin,
  checkoutSessionParams,
  ensureStripeCustomer,
  hasRecoverableStripeSubscription,
  mustRecoverExistingSubscription,
  PAST_DUE_GRACE_DAYS,
  paidPlanForPriceId,
  projectStripeSubscription,
  resolveCheckoutPriceId,
  shouldReplaceStoredSubscription,
  stripeCustomerBelongsToUser,
  subscriptionAccess,
  subscriptionHasEntitlement,
} from "./service";

const prices = {
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_month",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_pro_year",
  STRIPE_CLUB_MONTHLY_PRICE_ID: "price_club_month",
  STRIPE_CLUB_ANNUAL_PRICE_ID: "price_club_year",
};

function subscription(status: Stripe.Subscription.Status, overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    created: 1_000,
    customer: "cus_1",
    status,
    cancel_at_period_end: true,
    metadata: { userId: "user-1", plan: "pro" },
    items: { data: [{ current_period_end: 2_000, price: { id: "price_pro_month" } }, { current_period_end: 2_100, price: { id: "price_pro_year" } }] } as Stripe.ApiList<Stripe.SubscriptionItem>,
    ...overrides,
  } as Stripe.Subscription;
}

describe("production billing policy", () => {
  it.each([
    ["pro", "month", "price_pro_month"],
    ["pro", "year", "price_pro_year"],
    ["club", "month", "price_club_month"],
    ["club", "year", "price_club_year"],
  ] as const)("maps %s/%s only to its configured server price", (plan, interval, expected) => {
    expect(resolveCheckoutPriceId(plan, interval, prices)).toBe(expected);
    expect(paidPlanForPriceId(expected, prices)).toBe(plan);
  });

  it("applies Pro trial, ownership metadata, tax, payment, and canonical absolute URLs", () => {
    const params = checkoutSessionParams({ userId: "user-1", customerId: "cus_1", priceId: "price_1", appOrigin: "https://dartio.app", plan: "pro", interval: "year" });
    expect(params).toMatchObject({
      customer: "cus_1",
      automatic_tax: { enabled: true },
      payment_method_collection: "always",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      metadata: { userId: "user-1", plan: "pro", interval: "year" },
    });
    expect(params.subscription_data?.trial_period_days).toBe(14);
    expect(params.subscription_data?.trial_settings).toEqual({ end_behavior: { missing_payment_method: "cancel" } });
    expect(params.success_url).toBe("https://dartio.app/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://dartio.app/pricing?checkout=cancelled");
  });

  it("creates Club checkout without silently granting a trial", () => {
    const params = checkoutSessionParams({ userId: "user-1", customerId: "cus_1", priceId: "price_1", appOrigin: "https://dartio.app", plan: "club", interval: "month" });
    expect(params.subscription_data?.metadata).toMatchObject({ plan: "club", interval: "month" });
    expect(params.subscription_data?.trial_period_days).toBeUndefined();
    expect(params.subscription_data?.trial_settings).toBeUndefined();
  });

  it("accepts canonical HTTPS and local HTTP origins but rejects redirectable URL shapes", () => {
    expect(canonicalAppOrigin("https://dartio.app")).toBe("https://dartio.app");
    expect(canonicalAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    for (const value of ["http://dartio.app", "https://dartio.app/path", "https://dartio.app?next=bad", "https://user:pass@dartio.app"]) expect(() => canonicalAppOrigin(value)).toThrow("Invalid application origin");
  });

  it.each(["trialing", "active", "past_due", "unpaid", "incomplete"] as const)("routes existing %s subscriptions to recovery", (status) => expect(mustRecoverExistingSubscription(status)).toBe(true));
  it("permits a new checkout only after cancellation", () => expect(mustRecoverExistingSubscription("canceled")).toBe(false));
  it("detects authoritative remote subscription recovery states", () => {
    expect(hasRecoverableStripeSubscription([{ status: "active" }] as Stripe.Subscription[])).toBe(true);
    expect(hasRecoverableStripeSubscription([{ status: "canceled" }, { status: "incomplete_expired" }] as Stripe.Subscription[])).toBe(false);
  });

  it("reuses an existing customer without provisioning", async () => {
    const create = vi.fn(async () => "cus_new");
    expect(await ensureStripeCustomer("cus_existing", { create, async claim() { return null; }, async read() { return null; } })).toBe("cus_existing");
    expect(create).not.toHaveBeenCalled();
  });
  it("creates and claims a first customer", async () => expect(await ensureStripeCustomer(null, { async create() { return "cus_new"; }, async claim(value) { return value; }, async read() { return null; } })).toBe("cus_new"));
  it("recovers the canonical winner and discards a race-losing customer", async () => {
    const discard = vi.fn(async () => undefined);
    expect(await ensureStripeCustomer(null, { async create() { return "cus_loser"; }, async claim() { return null; }, async read() { return "cus_winner"; }, discard })).toBe("cus_winner");
    expect(discard).toHaveBeenCalledWith("cus_loser");
  });
  it("continues with the canonical winner if orphan cleanup temporarily fails", async () => {
    expect(await ensureStripeCustomer(null, { async create() { return "cus_loser"; }, async claim() { return null; }, async read() { return "cus_winner"; }, async discard() { throw new Error("Stripe unavailable"); } })).toBe("cus_winner");
  });
  it("never starts checkout with an unpersisted customer", async () => await expect(ensureStripeCustomer(null, { async create() { return "cus_orphan"; }, async claim() { return null; }, async read() { return null; } })).rejects.toThrow("Unable to persist"));

  it("requires a live Stripe customer with matching authenticated ownership metadata", () => {
    expect(stripeCustomerBelongsToUser({ deleted: true, id: "cus_1" } as Stripe.DeletedCustomer, "user-1")).toBe(false);
    expect(stripeCustomerBelongsToUser({ deleted: false, metadata: { userId: "user-2" } } as unknown as Stripe.Customer, "user-1")).toBe(false);
    expect(stripeCustomerBelongsToUser({ deleted: false, metadata: { userId: "user-1" } } as unknown as Stripe.Customer, "user-1")).toBe(true);
  });

  it.each(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"] as const)("projects %s exactly", (status) => {
    const projection = projectStripeSubscription(subscription(status), prices);
    expect(projection).toMatchObject({ status, plan: "pro", cancelAtPeriodEnd: true, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", userId: "user-1" });
    expect(projection.stripeSubscriptionCreatedAt.toISOString()).toBe("1970-01-01T00:16:40.000Z");
    expect(projection.currentPeriodEnd?.toISOString()).toBe("1970-01-01T00:35:00.000Z");
  });
  it("projects Club from its configured price even when portal changes leave stale metadata", () => {
    const clubItems = { data: [{ current_period_end: 2_100, price: { id: "price_club_year" } }] } as Stripe.ApiList<Stripe.SubscriptionItem>;
    expect(projectStripeSubscription(subscription("active", { metadata: { userId: "user-1", plan: "pro" }, items: clubItems }), prices).plan).toBe("club");
  });
  it("rejects unknown or mixed prices instead of granting access", () => {
    const unknownItems = { data: [{ current_period_end: 2_100, price: { id: "price_enterprise" } }] } as Stripe.ApiList<Stripe.SubscriptionItem>;
    expect(() => projectStripeSubscription(subscription("active", { items: unknownItems }), prices)).toThrow("unknown or mixed prices");
  });
  it.each(["paused", "incomplete_expired"] as const)("normalizes terminal Stripe status %s to canceled", (status) => expect(projectStripeSubscription(subscription(status), prices).status).toBe("canceled"));

  it("keeps active cancel-at-period-end access through the projected period", () => {
    const input = { plan: "pro", status: "active", currentPeriodEnd: new Date("2030-01-01T00:00:00Z"), cancelAtPeriodEnd: true } as const;
    expect(subscriptionAccess(input, new Date("2029-12-01T00:00:00Z"))).toEqual({ state: "active", plan: "pro", accessEndsAt: input.currentPeriodEnd, cancelAtPeriodEnd: true });
    expect(subscriptionHasEntitlement(input, "voice_always_on")).toBe(true);
  });
  it("grants a bounded seven-day past-due grace period and then fails closed", () => {
    const periodEnd = new Date("2030-01-01T00:00:00Z");
    const input = { plan: "club", status: "past_due", currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false } as const;
    const expectedGraceEnd = new Date(periodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
    expect(subscriptionAccess(input, new Date(expectedGraceEnd.getTime() - 1)).state).toBe("grace");
    expect(subscriptionAccess(input, expectedGraceEnd)).toEqual({ state: "inactive", plan: "free", accessEndsAt: null, cancelAtPeriodEnd: false });
  });
  it.each(["canceled", "unpaid", "incomplete"] as const)("revokes paid entitlements for terminal %s", (status) => {
    const input = { plan: "pro", status, currentPeriodEnd: new Date("2030-01-01T00:00:00Z"), cancelAtPeriodEnd: false } as const;
    expect(subscriptionHasEntitlement(input, "advanced_ai", new Date("2029-01-01T00:00:00Z"))).toBe(false);
  });

  it("always refreshes the same subscription and rejects an older different subscription", () => {
    const existing = { stripeSubscriptionId: "sub_new", stripeSubscriptionCreatedAt: new Date("2030-01-02T00:00:00Z") };
    expect(shouldReplaceStoredSubscription(existing, { stripeSubscriptionId: "sub_new", stripeSubscriptionCreatedAt: new Date("2029-01-01T00:00:00Z") })).toBe(true);
    expect(shouldReplaceStoredSubscription(existing, { stripeSubscriptionId: "sub_old", stripeSubscriptionCreatedAt: new Date("2030-01-01T00:00:00Z") })).toBe(false);
    expect(shouldReplaceStoredSubscription(existing, { stripeSubscriptionId: "sub_newer", stripeSubscriptionCreatedAt: new Date("2030-01-03T00:00:00Z") })).toBe(true);
  });
});
