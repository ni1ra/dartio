import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCurrentUser, createDatabase, getBillingCheckoutEnv } = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  createDatabase: vi.fn(),
  getBillingCheckoutEnv: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser }));
vi.mock("@/db/client", () => ({ createDatabase }));
vi.mock("@/lib/env/server", () => ({ getBillingCheckoutEnv }));

import { POST } from "./route";

describe("POST /api/billing/checkout Club availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentUser.mockResolvedValue({ id: "user-1", email: "lain@example.com", stripeCustomerId: null });
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
});
