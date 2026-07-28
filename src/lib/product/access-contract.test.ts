import { describe, expect, it } from "vitest";
import { hasPaidMembership, type AccessSnapshot } from "./access-contract";

const baseSnapshot: AccessSnapshot = {
  auth: "authenticated",
  effectivePlan: "free",
  accessState: "free",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: null, onlineSeats: 0 },
  availability: {
    localScoring: "implemented",
    advancedAi: "coming_soon",
    advancedCheckout: "implemented",
    voiceInput: "implemented",
    history: "coming_soon",
    deepStats: "coming_soon",
    onlineMultiplayer: "coming_soon",
    customPractice: "coming_soon",
    clubManagement: "coming_soon",
  },
};

describe("hasPaidMembership", () => {
  it.each([
    ["pro", "active", true],
    ["pro", "grace", true],
    ["club", "active", true],
    ["club", "grace", true],
    ["free", "active", false],
    ["pro", "free", false],
  ] as const)("identifies %s / %s membership as paid=%s", (effectivePlan, accessState, expected) => {
    expect(hasPaidMembership({ ...baseSnapshot, effectivePlan, accessState })).toBe(expected);
  });
});
