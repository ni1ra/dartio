import type Stripe from "stripe";
import { PLAN_CATALOG, type BillingInterval } from "./catalog";

export type StoredSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
export interface SubscriptionProjection {
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly status: StoredSubscriptionStatus;
  readonly plan: "pro";
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: Date | null;
  readonly userId: string | null;
}

const RECOVERABLE_STATUSES: readonly StoredSubscriptionStatus[] = ["trialing", "active", "past_due", "unpaid", "incomplete"];
export function mustRecoverExistingSubscription(status: StoredSubscriptionStatus | null | undefined): boolean { return status ? RECOVERABLE_STATUSES.includes(status) : false; }
export function hasRecoverableStripeSubscription(subscriptions: readonly Pick<Stripe.Subscription, "status">[]): boolean { return subscriptions.some((subscription) => mustRecoverExistingSubscription(normalizeStripeStatus(subscription.status))); }

export interface CustomerProvisioning {
  create(): Promise<string>;
  claim(createdCustomerId: string): Promise<string | null>;
  read(): Promise<string | null>;
}
export async function ensureStripeCustomer(existingCustomerId: string | null, provisioning: CustomerProvisioning): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const created = await provisioning.create();
  const canonical = await provisioning.claim(created) ?? await provisioning.read();
  if (!canonical) throw new Error("Unable to persist Stripe customer ownership");
  return canonical;
}

export function checkoutSessionParams(input: { userId: string; customerId: string; priceId: string; appOrigin: string; interval: BillingInterval }): Stripe.Checkout.SessionCreateParams {
  const origin = new URL(input.appOrigin).origin;
  return {
    mode: "subscription", customer: input.customerId, line_items: [{ price: input.priceId, quantity: 1 }], allow_promotion_codes: true, automatic_tax: { enabled: true },
    client_reference_id: input.userId, metadata: { userId: input.userId, plan: "pro", interval: input.interval },
    subscription_data: { trial_period_days: PLAN_CATALOG.pro.trialDays, metadata: { userId: input.userId, plan: "pro" } },
    success_url: `${origin}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  };
}

export function projectStripeSubscription(subscription: Stripe.Subscription): SubscriptionProjection {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const periodEnds = subscription.items.data.map((item) => item.current_period_end).filter((value): value is number => Number.isFinite(value));
  const currentPeriodEnd = periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null;
  return {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: normalizeStripeStatus(subscription.status),
    plan: "pro",
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd,
    userId: subscription.metadata.userId || null,
  };
}

export function normalizeStripeStatus(status: Stripe.Subscription.Status): StoredSubscriptionStatus {
  if (status === "paused" || status === "incomplete_expired") return "canceled";
  return status;
}
