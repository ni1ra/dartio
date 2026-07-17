import type Stripe from "stripe";

export interface WebhookStore {
  has(eventId: string): Promise<boolean>;
  runOnce(event: Stripe.Event, apply: () => Promise<void>): Promise<"processed" | "duplicate">;
  projectSubscription(event: Stripe.Event): Promise<void>;
}

export interface StripeSubscriptionReader { retrieve(subscriptionId: string): Promise<Stripe.Subscription> }

export async function currentSubscriptionForEvent(event: Stripe.Event, reader: StripeSubscriptionReader): Promise<Stripe.Subscription | null> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.subscription) return null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    return reader.retrieve(subscriptionId);
  }
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    return reader.retrieve(subscription.id);
  }
  return null;
}

export async function processStripeEvent(event: Stripe.Event, store: WebhookStore): Promise<"processed" | "duplicate"> {
  if (await store.has(event.id)) return "duplicate";
  return store.runOnce(event, async () => {
    if (event.type.startsWith("customer.subscription.") || event.type === "checkout.session.completed") await store.projectSubscription(event);
  });
}
