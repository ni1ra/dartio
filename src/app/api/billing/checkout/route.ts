import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createDatabase } from "@/db/client";
import { subscriptions, users } from "@/db/schema";
import { checkoutSessionParams, ensureStripeCustomer, hasRecoverableStripeSubscription, mustRecoverExistingSubscription } from "@/lib/billing/service";
import { getBillingCheckoutEnv } from "@/lib/env/server";
import { requireCurrentUser } from "@/lib/server/auth";

const bodySchema = z.object({ interval: z.enum(["month", "year"]) });
const idempotencySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { interval } = bodySchema.parse(await request.json());
    const requestKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
    const env = getBillingCheckoutEnv();
    const db = createDatabase();
    const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, user.id), columns: { status: true } });
    if (mustRecoverExistingSubscription(existing?.status)) return NextResponse.json({ error: "A subscription already exists", recovery: "portal" }, { status: 409 });

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const customerId = await ensureStripeCustomer(user.stripeCustomerId, {
      async create() { return (await stripe.customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: `dartio-customer-${user.id}` })).id; },
      async claim(createdCustomerId) { return (await db.update(users).set({ stripeCustomerId: createdCustomerId, updatedAt: new Date() }).where(and(eq(users.id, user.id), isNull(users.stripeCustomerId))).returning({ stripeCustomerId: users.stripeCustomerId }))[0]?.stripeCustomerId ?? null; },
      async read() { return (await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { stripeCustomerId: true } }))?.stripeCustomerId ?? null; },
    });
    const remoteSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    if (hasRecoverableStripeSubscription(remoteSubscriptions.data)) {
      return NextResponse.json({ error: "A subscription already exists", recovery: "portal" }, { status: 409 });
    }
    const priceId = interval === "year" ? env.STRIPE_PRO_ANNUAL_PRICE_ID : env.STRIPE_PRO_MONTHLY_PRICE_ID;
    const session = await stripe.checkout.sessions.create(checkoutSessionParams({ userId: user.id, customerId, priceId, appOrigin: env.NEXT_PUBLIC_APP_URL, interval }), { idempotencyKey: `dartio-checkout-${user.id}-${requestKey}` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: status === 500 ? "Unable to create checkout" : error instanceof Error ? error.message : "Invalid request" }, { status });
  }
}
