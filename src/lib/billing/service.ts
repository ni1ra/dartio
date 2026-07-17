import type Stripe from "stripe";
import { PLAN_CATALOG, hasEntitlement, isPaidPlanId, type BillingInterval, type Entitlement, type PaidPlanId } from "./catalog";

export type StoredSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
export interface SubscriptionProjection {
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string;
  readonly stripeSubscriptionCreatedAt: Date;
  readonly status: StoredSubscriptionStatus;
  readonly plan: PaidPlanId;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: Date | null;
  readonly userId: string | null;
}

export interface BillingPriceIds {
  readonly STRIPE_PRO_MONTHLY_PRICE_ID: string;
  readonly STRIPE_PRO_ANNUAL_PRICE_ID: string;
  readonly STRIPE_CLUB_MONTHLY_PRICE_ID: string;
  readonly STRIPE_CLUB_ANNUAL_PRICE_ID: string;
}

const RECOVERABLE_STATUSES: readonly StoredSubscriptionStatus[] = ["trialing", "active", "past_due", "unpaid", "incomplete"];
export const PAST_DUE_GRACE_DAYS = 7;

export function mustRecoverExistingSubscription(status: StoredSubscriptionStatus | null | undefined): boolean { return status ? RECOVERABLE_STATUSES.includes(status) : false; }
export function hasRecoverableStripeSubscription(subscriptions: readonly Pick<Stripe.Subscription, "status">[]): boolean { return subscriptions.some((subscription) => mustRecoverExistingSubscription(normalizeStripeStatus(subscription.status))); }

export interface CustomerProvisioning {
  create(): Promise<string>;
  claim(createdCustomerId: string): Promise<string | null>;
  read(): Promise<string | null>;
  discard?(createdCustomerId: string): Promise<void>;
}

export async function ensureStripeCustomer(existingCustomerId: string | null, provisioning: CustomerProvisioning): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const created = await provisioning.create();
  const canonical = await provisioning.claim(created) ?? await provisioning.read();
  if (!canonical) throw new Error("Unable to persist Stripe customer ownership");
  if (canonical !== created && provisioning.discard) await provisioning.discard(created).catch(() => undefined);
  return canonical;
}

export function stripeCustomerBelongsToUser(customer: Stripe.Customer | Stripe.DeletedCustomer, userId: string): customer is Stripe.Customer {
  return !customer.deleted && customer.metadata.userId === userId;
}

export function resolveCheckoutPriceId(plan: PaidPlanId, interval: BillingInterval, prices: BillingPriceIds): string {
  if (plan === "pro") return interval === "year" ? prices.STRIPE_PRO_ANNUAL_PRICE_ID : prices.STRIPE_PRO_MONTHLY_PRICE_ID;
  return interval === "year" ? prices.STRIPE_CLUB_ANNUAL_PRICE_ID : prices.STRIPE_CLUB_MONTHLY_PRICE_ID;
}

export function canonicalAppOrigin(value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid application origin");
  return url.origin;
}

export function checkoutSessionParams(input: { userId: string; customerId: string; priceId: string; appOrigin: string; plan: PaidPlanId; interval: BillingInterval }): Stripe.Checkout.SessionCreateParams {
  const origin = canonicalAppOrigin(input.appOrigin);
  const policy = PLAN_CATALOG[input.plan];
  const metadata = { userId: input.userId, plan: input.plan, interval: input.interval };
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = { metadata };
  if (policy.trialDays > 0) {
    subscriptionData.trial_period_days = policy.trialDays;
    subscriptionData.trial_settings = { end_behavior: { missing_payment_method: "cancel" } };
  }
  return {
    mode: "subscription",
    customer: input.customerId,
    customer_update: { address: "auto", name: "auto" },
    line_items: [{ price: input.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    billing_address_collection: "auto",
    payment_method_collection: "always",
    tax_id_collection: { enabled: true },
    client_reference_id: input.userId,
    metadata,
    subscription_data: subscriptionData,
    success_url: `${origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  };
}

export function paidPlanForPriceId(priceId: string, prices: BillingPriceIds): PaidPlanId | null {
  if (priceId === prices.STRIPE_PRO_MONTHLY_PRICE_ID || priceId === prices.STRIPE_PRO_ANNUAL_PRICE_ID) return "pro";
  if (priceId === prices.STRIPE_CLUB_MONTHLY_PRICE_ID || priceId === prices.STRIPE_CLUB_ANNUAL_PRICE_ID) return "club";
  return null;
}

export function projectStripeSubscription(subscription: Stripe.Subscription, prices: BillingPriceIds): SubscriptionProjection {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (!customerId) throw new Error("Stripe subscription has no customer");
  const plans = new Set(subscription.items.data.map((item) => paidPlanForPriceId(item.price.id, prices)).filter(isPaidPlanId));
  if (plans.size !== 1 || subscription.items.data.some((item) => !paidPlanForPriceId(item.price.id, prices))) throw new Error("Stripe subscription has unknown or mixed prices");
  const plan = [...plans][0]!;
  const periodEnds = subscription.items.data.map((item) => item.current_period_end).filter((value): value is number => Number.isFinite(value));
  const currentPeriodEnd = periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null;
  return {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionCreatedAt: new Date(subscription.created * 1000),
    status: normalizeStripeStatus(subscription.status),
    plan,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd,
    userId: subscription.metadata.userId || null,
  };
}

export function normalizeStripeStatus(status: Stripe.Subscription.Status): StoredSubscriptionStatus {
  if (status === "paused" || status === "incomplete_expired") return "canceled";
  return status;
}

export type SubscriptionAccess =
  | { readonly state: "active"; readonly plan: PaidPlanId; readonly accessEndsAt: Date | null; readonly cancelAtPeriodEnd: boolean }
  | { readonly state: "grace"; readonly plan: PaidPlanId; readonly accessEndsAt: Date; readonly cancelAtPeriodEnd: boolean }
  | { readonly state: "inactive"; readonly plan: "free"; readonly accessEndsAt: null; readonly cancelAtPeriodEnd: false };

export function subscriptionAccess(input: Pick<SubscriptionProjection, "plan" | "status" | "currentPeriodEnd" | "cancelAtPeriodEnd"> | null | undefined, now = new Date()): SubscriptionAccess {
  if (!input) return { state: "inactive", plan: "free", accessEndsAt: null, cancelAtPeriodEnd: false };
  if (input.status === "trialing" || input.status === "active") return { state: "active", plan: input.plan, accessEndsAt: input.currentPeriodEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd };
  if (input.status === "past_due" && input.currentPeriodEnd) {
    const graceEnd = new Date(input.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
    if (now < graceEnd) return { state: "grace", plan: input.plan, accessEndsAt: graceEnd, cancelAtPeriodEnd: input.cancelAtPeriodEnd };
  }
  return { state: "inactive", plan: "free", accessEndsAt: null, cancelAtPeriodEnd: false };
}

export function subscriptionHasEntitlement(input: Pick<SubscriptionProjection, "plan" | "status" | "currentPeriodEnd" | "cancelAtPeriodEnd"> | null | undefined, entitlement: Entitlement, now = new Date()): boolean {
  const access = subscriptionAccess(input, now);
  return access.plan !== "free" && hasEntitlement(access.plan, entitlement);
}

export function shouldReplaceStoredSubscription(existing: { stripeSubscriptionId: string | null; stripeSubscriptionCreatedAt: Date | null } | null, incoming: Pick<SubscriptionProjection, "stripeSubscriptionId" | "stripeSubscriptionCreatedAt">): boolean {
  return !existing || existing.stripeSubscriptionId === incoming.stripeSubscriptionId || !existing.stripeSubscriptionCreatedAt || incoming.stripeSubscriptionCreatedAt > existing.stripeSubscriptionCreatedAt;
}
