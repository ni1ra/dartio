import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createDatabase } from "@/db/client";
import { subscriptions, users } from "@/db/schema";
import { PLAN_CATALOG } from "@/lib/billing/catalog";
import { BillingPublicError, safeBillingError } from "@/lib/billing/errors";
import { checkoutSessionParams, ensureStripeCustomer, hasRecoverableStripeSubscription, isMissingStripeCustomer, mustRecoverExistingSubscription, resolveCheckoutPriceId, stripeCustomerBelongsToUser } from "@/lib/billing/service";
import { getBillingCheckoutEnv } from "@/lib/env/server";
import { requireCurrentUser } from "@/lib/server/auth";

const bodySchema = z.object({ plan: z.enum(["pro", "club"]), interval: z.enum(["month", "year"]) }).strict();
const idempotencySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { plan, interval } = bodySchema.parse(await request.json());
    if (PLAN_CATALOG[plan].checkout !== "self_serve") return NextResponse.json({ error: "plan_unavailable" }, { status: 409 });
    const requestKey = idempotencySchema.parse(request.headers.get("idempotency-key"));
    const env = getBillingCheckoutEnv();
    const db = createDatabase();
    const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, user.id), columns: { status: true } });
    if (mustRecoverExistingSubscription(existing?.status)) return NextResponse.json({ error: "A subscription already exists", recovery: "portal" }, { status: 409 });

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const provisioning = (expectedCustomerId: string | null) => ({
      async create() { return (await stripe.customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: `dartio-customer-${user.id}` })).id; },
      async claim(createdCustomerId: string) {
        const expectedLink = expectedCustomerId === null
          ? isNull(users.stripeCustomerId)
          : eq(users.stripeCustomerId, expectedCustomerId);
        return (await db.update(users).set({ stripeCustomerId: createdCustomerId, updatedAt: new Date() }).where(and(eq(users.id, user.id), expectedLink)).returning({ stripeCustomerId: users.stripeCustomerId }))[0]?.stripeCustomerId ?? null;
      },
      async read() { return (await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { stripeCustomerId: true } }))?.stripeCustomerId ?? null; },
      async discard(createdCustomerId: string) { await stripe.customers.del(createdCustomerId); },
    });

    let customerId = user.stripeCustomerId;
    let customer: Stripe.Customer | Stripe.DeletedCustomer;
    if (customerId) {
      try {
        customer = await stripe.customers.retrieve(customerId);
      } catch (error) {
        if (!isMissingStripeCustomer(error)) throw error;
        // Stripe idempotency keys are mode-scoped, so this creates (or reuses)
        // exactly one customer in the newly active Live/Sandbox namespace.
        customerId = await ensureStripeCustomer(null, provisioning(customerId));
        customer = await stripe.customers.retrieve(customerId);
      }
    } else {
      customerId = await ensureStripeCustomer(null, provisioning(null));
      customer = await stripe.customers.retrieve(customerId);
    }
    if (!stripeCustomerBelongsToUser(customer, user.id)) throw new BillingPublicError(409, "Billing account ownership requires support");
    const remoteSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (hasRecoverableStripeSubscription(remoteSubscriptions.data)) {
      return NextResponse.json({ error: "A subscription already exists", recovery: "portal" }, { status: 409 });
    }
    const priceId = resolveCheckoutPriceId(plan, interval, env);
    const session = await stripe.checkout.sessions.create(checkoutSessionParams({ userId: user.id, customerId, priceId, appOrigin: env.NEXT_PUBLIC_APP_URL, plan, interval }), { idempotencyKey: `dartio-checkout-${user.id}-${requestKey}` });
    if (!session.url) throw new Error("Stripe Checkout returned no URL");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const failure = safeBillingError(error, "Unable to create checkout");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
