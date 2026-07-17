import { describe, expect, it } from "vitest";
import { hasEntitlement, isPaidPlanId, PAID_PLAN_IDS, PLAN_CATALOG } from "./catalog";

describe("billing catalog", () => {
  it("keeps core local scoring free while gating paid services", () => {
    expect(hasEntitlement("free", "local_scoring")).toBe(true);
    expect(hasEntitlement("free", "voice_always_on")).toBe(false);
    expect(PLAN_CATALOG.free.aiMaxLevel).toBe(8);
    expect(PLAN_CATALOG.pro.aiMaxLevel).toBe(20);
  });
  it("allows only Pro and Club through self-serve paid checkout", () => {
    expect(PAID_PLAN_IDS).toEqual(["pro", "club"]);
    expect(isPaidPlanId("pro")).toBe(true);
    expect(isPaidPlanId("club")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(PLAN_CATALOG.pro.checkout).toBe("self_serve");
    expect(PLAN_CATALOG.pro.trialDays).toBe(14);
    expect(PLAN_CATALOG.club.checkout).toBe("self_serve");
    expect(PLAN_CATALOG.club.trialDays).toBe(0);
    expect(PLAN_CATALOG.club.onlineSeats).toBe(12);
  });
});
