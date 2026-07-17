import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getBillingPortalEnv } from "@/lib/env/server";
import { requireCurrentUser } from "@/lib/server/auth";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    if (!user.stripeCustomerId) return NextResponse.json({ error: "No billing account" }, { status: 404 });
    const env = getBillingPortalEnv();
    const session = await new Stripe(env.STRIPE_SECRET_KEY).billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${env.NEXT_PUBLIC_APP_URL}/account/billing` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: status === 500 ? "Unable to open billing portal" : error instanceof Error ? error.message : "Authentication required" }, { status });
  }
}
