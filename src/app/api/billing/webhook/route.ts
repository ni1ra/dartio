import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createDatabase } from "@/db/client";
import { subscriptions, users, webhookEvents } from "@/db/schema";
import { projectStripeSubscription, type SubscriptionProjection } from "@/lib/billing/service";
import { currentSubscriptionForEvent } from "@/lib/billing/webhook";
import { getBillingWebhookEnv, stripeEventMatchesMode } from "@/lib/env/server";

const CLAIM_STALE_AFTER_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  let stripe: Stripe;
  let event: Stripe.Event;
  let env: ReturnType<typeof getBillingWebhookEnv>;
  try {
    env = getBillingWebhookEnv();
    stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    event = stripe.webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET);
    if (!stripeEventMatchesMode(env.STRIPE_MODE, event.livemode)) throw new Error("Stripe mode mismatch");
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createDatabase();
  const claimStartedAt = new Date();
  try {
    const claim = await claimWebhookEvent(db, event, claimStartedAt);
    if (claim === "duplicate") return NextResponse.json({ received: true, duplicate: true });
    if (claim === "processing") return NextResponse.json({ error: "Webhook already processing" }, { status: 409 });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!userId || !customerId) throw new Error("Checkout ownership metadata is missing");
      const owner = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { stripeCustomerId: true } });
      if (!owner || (owner.stripeCustomerId && owner.stripeCustomerId !== customerId)) throw new Error("Stripe customer ownership mismatch");
      await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.stripeCustomerId)));
    }

    const current = await currentSubscriptionForEvent(event, stripe.subscriptions);
    if (current) await persistProjection(db, projectStripeSubscription(current, env));
    const completed = await db.update(webhookEvents).set({ processedAt: new Date() }).where(and(eq(webhookEvents.stripeEventId, event.id), eq(webhookEvents.processingStartedAt, claimStartedAt), isNull(webhookEvents.processedAt))).returning({ id: webhookEvents.stripeEventId });
    if (completed.length === 0) throw new Error("Webhook claim was lost before completion");
    return NextResponse.json({ received: true });
  } catch {
    await db.delete(webhookEvents).where(and(eq(webhookEvents.stripeEventId, event.id), eq(webhookEvents.processingStartedAt, claimStartedAt), isNull(webhookEvents.processedAt))).catch(() => undefined);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function claimWebhookEvent(db: ReturnType<typeof createDatabase>, event: Stripe.Event, claimStartedAt: Date): Promise<"acquired" | "duplicate" | "processing"> {
  const payload = event as unknown as Record<string, unknown>;
  const inserted = await db.insert(webhookEvents).values({ stripeEventId: event.id, type: event.type, payload, processingStartedAt: claimStartedAt, processedAt: null }).onConflictDoNothing().returning({ id: webhookEvents.stripeEventId });
  if (inserted.length > 0) return "acquired";
  const existing = await db.query.webhookEvents.findFirst({ where: eq(webhookEvents.stripeEventId, event.id), columns: { processedAt: true } });
  if (existing?.processedAt) return "duplicate";
  const staleBefore = new Date(claimStartedAt.getTime() - CLAIM_STALE_AFTER_MS);
  const reclaimed = await db.update(webhookEvents).set({ type: event.type, payload, processingStartedAt: claimStartedAt }).where(and(eq(webhookEvents.stripeEventId, event.id), isNull(webhookEvents.processedAt), or(isNull(webhookEvents.processingStartedAt), lt(webhookEvents.processingStartedAt, staleBefore)))).returning({ id: webhookEvents.stripeEventId });
  return reclaimed.length > 0 ? "acquired" : "processing";
}

async function persistProjection(db: ReturnType<typeof createDatabase>, projection: SubscriptionProjection) {
  const values = {
    stripeCustomerId: projection.stripeCustomerId,
    stripeSubscriptionId: projection.stripeSubscriptionId,
    stripeSubscriptionCreatedAt: projection.stripeSubscriptionCreatedAt,
    plan: projection.plan,
    status: projection.status,
    currentPeriodEnd: projection.currentPeriodEnd,
    cancelAt: projection.cancelAt,
    cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
    updatedAt: sql`now()`,
  } as const;
  const sameOrNewer = or(
    eq(subscriptions.stripeSubscriptionId, projection.stripeSubscriptionId),
    isNull(subscriptions.stripeSubscriptionCreatedAt),
    lt(subscriptions.stripeSubscriptionCreatedAt, projection.stripeSubscriptionCreatedAt),
  );
  if (projection.userId) {
    const owner = await db.query.users.findFirst({ where: eq(users.id, projection.userId), columns: { stripeCustomerId: true } });
    if (!owner || (owner.stripeCustomerId && owner.stripeCustomerId !== projection.stripeCustomerId)) throw new Error("Stripe customer ownership mismatch");
    await db.update(users).set({ stripeCustomerId: projection.stripeCustomerId, updatedAt: new Date() }).where(and(eq(users.id, projection.userId), isNull(users.stripeCustomerId)));
    await db.insert(subscriptions).values({ userId: projection.userId, ...values }).onConflictDoUpdate({ target: subscriptions.userId, set: values, setWhere: sameOrNewer });
    return;
  }
  await db.update(subscriptions).set(values).where(and(eq(subscriptions.stripeCustomerId, projection.stripeCustomerId), sameOrNewer));
}
