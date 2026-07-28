import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { currentSubscriptionForEvent, processStripeEvent, type WebhookStore } from "./webhook";

class MemoryStore implements WebhookStore {
  readonly ids = new Set<string>(); projections = 0;
  async has(id: string) { return this.ids.has(id); }
  async runOnce(event: Stripe.Event, apply: () => Promise<void>) { if (this.ids.has(event.id)) return "duplicate" as const; await apply(); this.ids.add(event.id); return "processed" as const; }
  async projectSubscription() { this.projections++; }
}

describe("Stripe webhook processing", () => {
  it("projects a subscription event exactly once across replay", async () => {
    const store = new MemoryStore();
    const event = { id: "evt_1", type: "customer.subscription.updated" } as Stripe.Event;
    expect(await processStripeEvent(event, store)).toBe("processed");
    expect(await processStripeEvent(event, store)).toBe("duplicate");
    expect(store.projections).toBe(1);
  });

  it("does not claim an event when projection fails", async () => {
    const store = new MemoryStore();
    store.projectSubscription = async () => { throw new Error("db unavailable"); };
    const event = { id: "evt_retry", type: "checkout.session.completed" } as Stripe.Event;
    await expect(processStripeEvent(event, store)).rejects.toThrow("db unavailable");
    expect(store.ids.has(event.id)).toBe(false);
  });

  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] as const)("retrieves current Stripe state for %s instead of trusting delivery order", async (type) => {
    const retrieve = vi.fn(async (id: string) => ({ id, status: "active" }) as Stripe.Subscription);
    const event = { type, data: { object: { id: "sub_1", status: type.endsWith("deleted") ? "canceled" : "past_due" } } } as Stripe.Event;
    expect((await currentSubscriptionForEvent(event, { retrieve }))?.status).toBe("active");
    expect(retrieve).toHaveBeenCalledWith("sub_1");
  });

  it("retrieves the Checkout subscription and ignores unrelated events", async () => {
    const retrieve = vi.fn(async (id: string) => ({ id }) as Stripe.Subscription);
    const checkout = { type: "checkout.session.completed", data: { object: { subscription: "sub_checkout" } } } as Stripe.Event;
    expect((await currentSubscriptionForEvent(checkout, { retrieve }))?.id).toBe("sub_checkout");
    expect(await currentSubscriptionForEvent({ type: "invoice.created", data: { object: {} } } as Stripe.Event, { retrieve })).toBeNull();
  });
});
