import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { checkoutSessionParams, ensureStripeCustomer, hasRecoverableStripeSubscription, mustRecoverExistingSubscription, projectStripeSubscription } from "./service";

function subscription(status: Stripe.Subscription.Status, overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return { id: "sub_1", customer: "cus_1", status, cancel_at_period_end: true, metadata: { userId: "user-1" }, items: { data: [{ current_period_end: 2_000 }, { current_period_end: 2_100 }] } as Stripe.ApiList<Stripe.SubscriptionItem>, ...overrides } as Stripe.Subscription;
}

describe("production billing policy", () => {
  it("applies the configured trial, customer, metadata, and absolute origins", () => {
    const params = checkoutSessionParams({ userId: "user-1", customerId: "cus_1", priceId: "price_1", appOrigin: "https://dartio.app", interval: "year" });
    expect(params.customer).toBe("cus_1");
    expect(params.subscription_data?.trial_period_days).toBe(14);
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.success_url).toBe("https://dartio.app/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://dartio.app/pricing?checkout=cancelled");
  });
  it.each(["trialing", "active", "past_due", "unpaid", "incomplete"] as const)("routes existing %s subscriptions to recovery", (status) => expect(mustRecoverExistingSubscription(status)).toBe(true));
  it("permits a new checkout only after cancellation", () => expect(mustRecoverExistingSubscription("canceled")).toBe(false));
  it("reuses an existing customer without provisioning", async () => {
    let calls = 0;
    expect(await ensureStripeCustomer("cus_existing", { async create() { calls++; return "cus_new"; }, async claim() { return null; }, async read() { return null; } })).toBe("cus_existing");
    expect(calls).toBe(0);
  });
  it("creates and claims a first customer", async () => expect(await ensureStripeCustomer(null, { async create() { return "cus_new"; }, async claim(value) { return value; }, async read() { return null; } })).toBe("cus_new"));
  it("recovers the winning customer from a concurrent claim", async () => expect(await ensureStripeCustomer(null, { async create() { return "cus_race_loser"; }, async claim() { return null; }, async read() { return "cus_winner"; } })).toBe("cus_winner"));
  it("never starts checkout with an unpersisted customer", async () => await expect(ensureStripeCustomer(null, { async create() { return "cus_orphan"; }, async claim() { return null; }, async read() { return null; } })).rejects.toThrow("Unable to persist"));
  it("detects authoritative remote subscription recovery states", () => {
    expect(hasRecoverableStripeSubscription([{ status: "active" }] as Stripe.Subscription[])).toBe(true);
    expect(hasRecoverableStripeSubscription([{ status: "canceled" }, { status: "incomplete_expired" }] as Stripe.Subscription[])).toBe(false);
  });
  it.each(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"] as const)("projects %s exactly", (status) => {
    const projection = projectStripeSubscription(subscription(status));
    expect(projection).toMatchObject({ status, plan: "pro", cancelAtPeriodEnd: true, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", userId: "user-1" });
    expect(projection.currentPeriodEnd?.toISOString()).toBe("1970-01-01T00:35:00.000Z");
  });
  it.each(["paused", "incomplete_expired"] as const)("normalizes terminal Stripe status %s to canceled", (status) => expect(projectStripeSubscription(subscription(status)).status).toBe("canceled"));
});
