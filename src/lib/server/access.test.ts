import { describe, expect, it } from "vitest";
import { AuthServiceError, type InternalUser } from "./identity";
import {
  AccessServiceError,
  accessSnapshot,
  getAccessForUser,
  getCurrentAccess,
  type StoredAccessSubscription,
  type SubscriptionReader,
} from "./access";

const user: InternalUser = {
  id: "user-1",
  authSubject: "auth-1",
  email: "lain@example.com",
  stripeCustomerId: "cus_secret",
  profile: { userId: "user-1", displayName: "lain", avatarUrl: null, preferences: {} },
};
const periodEnd = new Date("2026-07-10T00:00:00.000Z");
const base: StoredAccessSubscription = {
  plan: "pro",
  status: "active",
  currentPeriodEnd: periodEnd,
  cancelAt: null,
  cancelAtPeriodEnd: false,
};
const reader = (value: StoredAccessSubscription | null): SubscriptionReader => ({
  async findForUser() { return value; },
});

describe("accessSnapshot", () => {
  it("gives anonymous and authenticated non-subscribers the Free policy", () => {
    expect(accessSnapshot(false, null)).toMatchObject({ auth: "anonymous", effectivePlan: "free", accessState: "free", limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 } });
    expect(accessSnapshot(true, null)).toMatchObject({ auth: "authenticated", effectivePlan: "free", accessState: "free" });
    expect(accessSnapshot(false, null).entitlements).toEqual(["local_scoring", "basic_checkout"]);
  });

  it.each([
    ["active", "pro"],
    ["trialing", "pro"],
    ["active", "club"],
    ["trialing", "club"],
  ] as const)("projects %s %s from the canonical plan catalog", (status, plan) => {
    const snapshot = accessSnapshot(true, { ...base, status, plan }, new Date("2026-07-01T00:00:00.000Z"));
    expect(snapshot).toMatchObject({ effectivePlan: plan, accessState: "active", limits: { aiMaxLevel: 20 } });
    expect(snapshot.entitlements).toContain("advanced_checkout");
  });

  it("grants past-due access only inside the canonical grace interval", () => {
    const pastDue = { ...base, status: "past_due" as const };
    expect(accessSnapshot(true, pastDue, new Date("2026-07-16T23:59:59.999Z"))).toMatchObject({ effectivePlan: "pro", accessState: "grace", accessEndsAt: "2026-07-17T00:00:00.000Z" });
    expect(accessSnapshot(true, pastDue, new Date("2026-07-17T00:00:00.000Z"))).toMatchObject({ effectivePlan: "free", accessState: "free", accessEndsAt: null });
  });

  it("fails closed at the exact scheduled cancellation boundary", () => {
    const scheduled = { ...base, cancelAtPeriodEnd: true };
    expect(accessSnapshot(true, scheduled, new Date("2026-07-09T23:59:59.999Z"))).toMatchObject({ effectivePlan: "pro", accessEndsAt: "2026-07-10T00:00:00.000Z", cancelAtPeriodEnd: true });
    expect(accessSnapshot(true, scheduled, periodEnd)).toMatchObject({ effectivePlan: "free", accessState: "free", accessEndsAt: null, cancelAtPeriodEnd: false });
  });

  it("uses an explicit cancellation instant even when it is earlier than the period end", () => {
    const cancelAt = new Date("2026-07-05T12:00:00.000Z");
    const scheduled = { ...base, cancelAt };
    expect(accessSnapshot(true, scheduled, new Date("2026-07-05T11:59:59.999Z"))).toMatchObject({ effectivePlan: "pro", accessEndsAt: cancelAt.toISOString() });
    expect(accessSnapshot(true, scheduled, cancelAt)).toMatchObject({ effectivePlan: "free", accessState: "free" });
  });

  it("truncates past-due grace at an earlier explicit cancellation instant", () => {
    const cancelAt = new Date("2026-07-12T00:00:00.000Z");
    const pastDue = { ...base, status: "past_due" as const, cancelAt };
    expect(accessSnapshot(true, pastDue, new Date("2026-07-11T23:59:59.999Z"))).toMatchObject({ effectivePlan: "pro", accessState: "grace", accessEndsAt: cancelAt.toISOString() });
    expect(accessSnapshot(true, pastDue, cancelAt)).toMatchObject({ effectivePlan: "free", accessState: "free" });
  });

  it.each(["canceled", "unpaid", "incomplete"] as const)("fails closed for terminal %s status", (status) => {
    expect(accessSnapshot(true, { ...base, status }, new Date("2026-07-01T00:00:00.000Z"))).toMatchObject({ effectivePlan: "free", accessState: "free" });
  });

  it("fails closed for a corrupt stored plan", () => {
    expect(accessSnapshot(true, { ...base, plan: "enterprise" }, new Date("2026-07-01T00:00:00.000Z"))).toMatchObject({ effectivePlan: "free", accessState: "free" });
  });

  it("contains product availability but no billing identifiers", () => {
    const snapshot = accessSnapshot(true, base, new Date("2026-07-01T00:00:00.000Z"));
    // The availability map is product truth, independent from what a plan grants.
    expect(snapshot.availability).toMatchObject({ advancedAi: "implemented", advancedCheckout: "implemented", voiceInput: "implemented", history: "implemented", deepStats: "implemented", onlineMultiplayer: "implemented", customPractice: "implemented", clubManagement: "coming_soon" });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).toContain("coming_soon");
    expect(serialized).not.toContain("cus_secret");
    expect(serialized).not.toContain("stripeCustomerId");
    expect(serialized).not.toContain("stripeSubscriptionId");
  });
});

describe("server access resolution", () => {
  it("resolves anonymous access without reading subscriptions", async () => {
    const failingReader: SubscriptionReader = { async findForUser() { throw new Error("must not run"); } };
    await expect(getCurrentAccess({ resolveUser: async () => null, reader: failingReader })).resolves.toMatchObject({ auth: "anonymous", effectivePlan: "free" });
  });

  it("reads a verified internal user's subscription", async () => {
    await expect(getAccessForUser(user, { reader: reader(base), now: new Date("2026-07-01T00:00:00.000Z") })).resolves.toMatchObject({ auth: "authenticated", effectivePlan: "pro" });
  });

  it("does not convert auth or database failures into Free access", async () => {
    await expect(getCurrentAccess({ resolveUser: async () => { throw new AuthServiceError(); } })).rejects.toBeInstanceOf(AuthServiceError);
    await expect(getAccessForUser(user, { reader: { async findForUser() { throw new Error("database down"); } } })).rejects.toBeInstanceOf(AccessServiceError);
  });
});
