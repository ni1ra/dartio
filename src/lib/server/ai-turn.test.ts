import { describe, expect, it } from "vitest";
import { accessSnapshot, type AccessSnapshot, type StoredAccessSubscription } from "./access";
import { AiTurnAccessError, generateAuthorizedAiTurn, type PremiumAiTurnInput } from "./ai-turn";

const input: PremiumAiTurnInput = {
  level: 20,
  score: 40,
  opened: true,
  inRule: "straight",
  outRule: "double",
};
const active: StoredAccessSubscription = {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
};

describe("premium AI turn authorization", () => {
  it("rejects anonymous access before generation", () => {
    expect(() => generateAuthorizedAiTurn(input, accessSnapshot(false, null), () => 1))
      .toThrowError(expect.objectContaining({ status: 401, code: "authentication_required" }));
  });

  it("rejects authenticated Free access", () => {
    expect(() => generateAuthorizedAiTurn(input, accessSnapshot(true, null), () => 1))
      .toThrowError(expect.objectContaining({ status: 403, code: "advanced_ai_required" }));
  });

  it.each(["pro", "club"] as const)("allows an entitled active %s snapshot", (plan) => {
    const access = accessSnapshot(true, { ...active, plan }, new Date("2029-01-01T00:00:00.000Z"));
    expect(generateAuthorizedAiTurn(input, access, () => 1)).toEqual([
      expect.objectContaining({ segment: 20, multiplier: 2, score: 40 }),
    ]);
  });

  it("requires both the entitlement and the level limit", () => {
    const paid = accessSnapshot(true, active, new Date("2029-01-01T00:00:00.000Z"));
    const missingEntitlement: AccessSnapshot = {
      ...paid,
      entitlements: paid.entitlements.filter((value) => value !== "advanced_ai"),
    };
    const limited: AccessSnapshot = { ...paid, limits: { ...paid.limits, aiMaxLevel: 8 } };

    for (const access of [missingEntitlement, limited]) {
      expect(() => generateAuthorizedAiTurn(input, access, () => 1)).toThrow(AiTurnAccessError);
    }
  });

  it("rejects non-premium levels even for paid access", () => {
    const access = accessSnapshot(true, active, new Date("2029-01-01T00:00:00.000Z"));
    expect(() => generateAuthorizedAiTurn({ ...input, level: 8 }, access, () => 1)).toThrow(RangeError);
  });
});
