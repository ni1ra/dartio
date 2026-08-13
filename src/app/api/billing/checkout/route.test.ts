import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCurrentUser, createDatabase, getBillingCheckoutEnv, stripeClient } = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createDatabase: vi.fn(),
  getBillingCheckoutEnv: vi.fn(),
  stripeClient: {
    customers: { create: vi.fn(), del: vi.fn(), retrieve: vi.fn() },
    subscriptions: { list: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
}));

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser }));
vi.mock("@/db/client", () => ({ createDatabase }));
vi.mock("@/lib/env/server", () => ({ getBillingCheckoutEnv }));
vi.mock("stripe", () => ({ default: vi.fn(function StripeMock() { return stripeClient; }) }));

import { POST } from "./route";

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentUser.mockResolvedValue({ id: "user-1", email: "lain@example.com", stripeCustomerId: null });
    getBillingCheckoutEnv.mockReturnValue({
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_example",
      STRIPE_PRO_MONTHLY_PRICE_ID: "price_live_monthly",
      STRIPE_PRO_ANNUAL_PRICE_ID: "price_live_annual",
      STRIPE_CLUB_MONTHLY_PRICE_ID: "price_unused_club_monthly",
      STRIPE_CLUB_ANNUAL_PRICE_ID: "price_unused_club_annual",
      NEXT_PUBLIC_APP_URL: "https://dartioopus46.vercel.app",
    });
  });

  it("rejects direct Club checkout before environment, database, or Stripe work", async () => {
    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request_key_123456" },
      body: JSON.stringify({ plan: "club", interval: "year" }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "plan_unavailable" });
    expect(requireCurrentUser).toHaveBeenCalledOnce();
    expect(getBillingCheckoutEnv).not.toHaveBeenCalled();
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it("replaces a customer from the inactive Stripe mode before starting checkout", async () => {
    requireCurrentUser.mockResolvedValue({ id: "user-1", email: "lain@example.com", stripeCustomerId: "cus_sandbox" });
    const returning = vi.fn().mockResolvedValue([{ stripeCustomerId: "cus_live" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    createDatabase.mockReturnValue({
      query: {
        subscriptions: { findFirst: vi.fn().mockResolvedValue(null) },
        users: { findFirst: vi.fn().mockResolvedValue({ stripeCustomerId: "cus_live" }) },
      },
      update,
    });
    stripeClient.customers.retrieve
      .mockRejectedValueOnce({ type: "StripeInvalidRequestError", code: "resource_missing" })
      .mockResolvedValueOnce({ id: "cus_live", deleted: false, metadata: { userId: "user-1" } });
    stripeClient.customers.create.mockResolvedValue({ id: "cus_live" });
    stripeClient.subscriptions.list.mockResolvedValue({ data: [] });
    stripeClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/session" });

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request_key_123456" },
      body: JSON.stringify({ plan: "pro", interval: "month" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/session" });
    expect(stripeClient.customers.retrieve).toHaveBeenNthCalledWith(1, "cus_sandbox");
    expect(stripeClient.customers.retrieve).toHaveBeenNthCalledWith(2, "cus_live");
    expect(stripeClient.customers.create).toHaveBeenCalledWith(
      { email: "lain@example.com", metadata: { userId: "user-1" } },
      { idempotencyKey: "dartio-customer-user-1" },
    );
    expect(update).toHaveBeenCalledOnce();
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledOnce();
  });
});
