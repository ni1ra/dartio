import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createDatabase } from "@/db/client";
import { subscriptions, users, webhookEvents } from "@/db/schema";
import { projectStripeSubscription, type SubscriptionProjection } from "@/lib/billing/service";
import { getBillingWebhookEnv } from "@/lib/env/server";

export async function POST(request: Request) {
  const env = getBillingWebhookEnv();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET); }
  catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }

  const db = createDatabase();
  const inserted = await db.insert(webhookEvents).values({ stripeEventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> }).onConflictDoNothing().returning({ id: webhookEvents.stripeEventId });
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (userId && customerId) await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.stripeCustomerId)));
      const subscription = typeof session.subscription === "string" ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
      if (subscription) await persistProjection(projectStripeSubscription(subscription));
    } else if (event.type.startsWith("customer.subscription.")) {
      await persistProjection(projectStripeSubscription(event.data.object as Stripe.Subscription));
    }
  } catch (error) {
    await db.delete(webhookEvents).where(eq(webhookEvents.stripeEventId, event.id));
    throw error;
  }
  return NextResponse.json({ received: true });

  async function persistProjection(projection: SubscriptionProjection) {
    const values = { stripeCustomerId: projection.stripeCustomerId, stripeSubscriptionId: projection.stripeSubscriptionId, plan: projection.plan, status: projection.status, currentPeriodEnd: projection.currentPeriodEnd, cancelAtPeriodEnd: projection.cancelAtPeriodEnd, updatedAt: sql`now()` } as const;
    if (projection.userId) {
      const owner = await db.query.users.findFirst({ where: eq(users.id, projection.userId), columns: { stripeCustomerId: true } });
      if (!owner || (owner.stripeCustomerId && owner.stripeCustomerId !== projection.stripeCustomerId)) throw new Error("Stripe customer ownership mismatch");
      await db.update(users).set({ stripeCustomerId: projection.stripeCustomerId, updatedAt: new Date() }).where(and(eq(users.id, projection.userId), isNull(users.stripeCustomerId)));
      await db.insert(subscriptions).values({ userId: projection.userId, ...values }).onConflictDoUpdate({ target: subscriptions.userId, set: values });
    } else {
      await db.update(subscriptions).set(values).where(eq(subscriptions.stripeCustomerId, projection.stripeCustomerId));
    }
  }
}
