import { NextResponse } from "next/server";
import Stripe from "stripe";
import { BillingPublicError, safeBillingError } from "@/lib/billing/errors";
import { canonicalAppOrigin, stripeCustomerBelongsToUser } from "@/lib/billing/service";
import { getBillingPortalEnv } from "@/lib/env/server";
import { requireCurrentUser } from "@/lib/server/auth";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    if (!user.stripeCustomerId) throw new BillingPublicError(404, "No billing account");
    const env = getBillingPortalEnv();
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (!stripeCustomerBelongsToUser(customer, user.id)) throw new BillingPublicError(409, "Billing account ownership requires support");
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${canonicalAppOrigin(env.NEXT_PUBLIC_APP_URL)}/account` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const failure = safeBillingError(error, "Unable to open billing portal");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
