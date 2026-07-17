import type Stripe from "stripe";

export interface WebhookStore {
  has(eventId: string): Promise<boolean>;
  runOnce(event: Stripe.Event, apply: () => Promise<void>): Promise<"processed" | "duplicate">;
  projectSubscription(event: Stripe.Event): Promise<void>;
}

export async function processStripeEvent(event: Stripe.Event, store: WebhookStore): Promise<"processed" | "duplicate"> {
  if (await store.has(event.id)) return "duplicate";
  return store.runOnce(event, async () => {
    if (event.type.startsWith("customer.subscription.") || event.type === "checkout.session.completed") await store.projectSubscription(event);
  });
}
