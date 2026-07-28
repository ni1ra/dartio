import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ requireCurrentUser: vi.fn() }));

import { AccessServiceError, type StoredAccessSubscription, type SubscriptionReader } from "./access";
import { AuthError, AuthServiceError, type InternalUser } from "./identity";
import { EntitlementRequiredError, requireEntitlement, safeEntitlementError } from "./entitlements";

const user: InternalUser = {
  id: "user-1",
  authSubject: "auth-1",
  email: "lain@example.com",
  stripeCustomerId: "cus_not_public",
  profile: { userId: "user-1", displayName: "lain", avatarUrl: null, preferences: {} },
};
const periodEnd = new Date("2026-07-10T00:00:00.000Z");
const active: StoredAccessSubscription = {
  plan: "pro",
  status: "active",
  currentPeriodEnd: periodEnd,
  cancelAt: null,
  cancelAtPeriodEnd: false,
};
const reader = (subscription: StoredAccessSubscription | null): SubscriptionReader => ({
  async findForUser() { return subscription; },
});
const requireUser = async () => user;

describe("requireEntitlement", () => {
  it("returns the verified user and canonical active access", async () => {
    const result = await requireEntitlement("voice_always_on", { requireUser, reader: reader(active), now: new Date("2026-07-01T00:00:00.000Z") });
    expect(result.user).toBe(user);
    expect(result.access).toMatchObject({ effectivePlan: "pro", accessState: "active" });
    expect(JSON.stringify(result.access)).not.toContain("cus_not_public");
  });

  it("allows Club and past-due access only inside grace", async () => {
    const pastDue = { ...active, plan: "club", status: "past_due" } as const;
    await expect(requireEntitlement("voice_always_on", { requireUser, reader: reader(pastDue), now: new Date("2026-07-16T23:59:59.999Z") })).resolves.toMatchObject({ access: { effectivePlan: "club", accessState: "grace" } });
    await expect(requireEntitlement("voice_always_on", { requireUser, reader: reader(pastDue), now: new Date("2026-07-17T00:00:00.000Z") })).rejects.toBeInstanceOf(EntitlementRequiredError);
  });

  it.each([null, { ...active, status: "canceled" as const }, { ...active, status: "unpaid" as const }, { ...active, status: "incomplete" as const }])("rejects Free or terminal access", async (subscription) => {
    await expect(requireEntitlement("advanced_checkout", { requireUser, reader: reader(subscription), now: new Date("2026-07-01T00:00:00.000Z") })).rejects.toMatchObject({ status: 402, entitlement: "advanced_checkout" });
  });

  it("fails closed at the exact scheduled cancellation boundary", async () => {
    const scheduled = { ...active, cancelAt: new Date("2026-07-05T00:00:00.000Z") };
    await expect(requireEntitlement("voice_always_on", { requireUser, reader: reader(scheduled), now: scheduled.cancelAt })).rejects.toBeInstanceOf(EntitlementRequiredError);
  });

  it("propagates authentication and access infrastructure failures", async () => {
    await expect(requireEntitlement("voice_always_on", { requireUser: async () => { throw new AuthError(); } })).rejects.toBeInstanceOf(AuthError);
    await expect(requireEntitlement("voice_always_on", { requireUser, reader: { async findForUser() { throw new Error("database down"); } } })).rejects.toBeInstanceOf(AccessServiceError);
  });
});

describe("safeEntitlementError", () => {
  it("maps only known authority failures and sanitizes everything else", () => {
    expect(safeEntitlementError(new AuthError(), "fallback")).toEqual({ status: 401, body: { error: "authentication_required" } });
    expect(safeEntitlementError(new EntitlementRequiredError("voice_always_on"), "fallback")).toEqual({ status: 402, body: { error: "upgrade_required", required: "voice_always_on" } });
    expect(safeEntitlementError(new AuthServiceError(), "fallback")).toEqual({ status: 503, body: { error: "access_status_unavailable" } });
    expect(safeEntitlementError(new AccessServiceError(), "fallback")).toEqual({ status: 503, body: { error: "access_status_unavailable" } });
    expect(safeEntitlementError(new Error("sk-secret DATABASE_URL"), "fallback")).toEqual({ status: 500, body: { error: "fallback" } });
  });
});
