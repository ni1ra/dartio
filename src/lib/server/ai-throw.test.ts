import { describe, expect, it, vi } from "vitest";
import { accessSnapshot, type AccessSnapshot, type StoredAccessSubscription } from "./access";
import { AiThrowAccessError, generateAuthorizedAiThrow, type PremiumAiThrowInput } from "./ai-throw";

const input: PremiumAiThrowInput = {
  level: 20,
  target: { segment: 20, multiplier: 3 },
};
const active: StoredAccessSubscription = {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
};
const paid = (): AccessSnapshot => accessSnapshot(
  true,
  active,
  new Date("2029-01-01T00:00:00.000Z"),
);

describe("premium AI throw authorization", () => {
  it.each(["pro", "club"] as const)("returns one positioned sample for an entitled active %s snapshot", (plan) => {
    const access = accessSnapshot(true, { ...active, plan }, new Date("2029-01-01T00:00:00.000Z"));
    expect(generateAuthorizedAiThrow(input, access, () => 1)).toEqual({
      segment: 20,
      multiplier: 3,
      score: 60,
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it("rejects anonymous access before sampling", () => {
    const random = vi.fn(() => 1);
    expect(() => generateAuthorizedAiThrow(input, accessSnapshot(false, null), random))
      .toThrow(new AiThrowAccessError(401, "authentication_required"));
    expect(random).not.toHaveBeenCalled();
  });

  it("rejects authenticated Free access before sampling", () => {
    const random = vi.fn(() => 1);
    expect(() => generateAuthorizedAiThrow(input, accessSnapshot(true, null), random))
      .toThrow(new AiThrowAccessError(403, "advanced_ai_required"));
    expect(random).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing entitlement",
      mutate: (access: AccessSnapshot): AccessSnapshot => ({
        ...access,
        entitlements: access.entitlements.filter((value) => value !== "advanced_ai"),
      }),
    },
    {
      label: "lower canonical level ceiling",
      mutate: (access: AccessSnapshot): AccessSnapshot => ({
        ...access,
        limits: { ...access.limits, aiMaxLevel: 8 },
      }),
    },
    {
      label: "unimplemented feature",
      mutate: (access: AccessSnapshot): AccessSnapshot => ({
        ...access,
        availability: { ...access.availability, advancedAi: "coming_soon" },
      }),
    },
  ])("requires canonical $label before sampling", ({ mutate }) => {
    const random = vi.fn(() => 1);
    expect(() => generateAuthorizedAiThrow(input, mutate(paid()), random)).toThrow(AiThrowAccessError);
    expect(random).not.toHaveBeenCalled();
  });

  it("rejects non-premium levels before sampling", () => {
    const random = vi.fn(() => 1);
    expect(() => generateAuthorizedAiThrow({ ...input, level: 8 }, paid(), random)).toThrow(RangeError);
    expect(random).not.toHaveBeenCalled();
  });
});
