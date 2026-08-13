import { describe, expect, it } from "vitest";

import { vi } from "vitest";
vi.mock("@/lib/server/auth", () => ({ getCurrentUser: vi.fn() }));
import type { StatMatch } from "@/domain/match-stats";
import { AccessServiceError, accessSnapshot } from "@/lib/server/access";
import { AuthServiceError } from "@/lib/server/identity";
import { MatchHistoryError } from "@/lib/server/match-history";
import { handleCheckoutAdviceRequest } from "./route";

const validBody = { score: 141, dartsAvailable: 3, outRule: "double", personalize: false };
const request = (body: unknown) => new Request("https://dartio.test/api/checkout/advice", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const paidAccess = () => accessSnapshot(true, {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
}, new Date("2029-01-01T00:00:00.000Z"));
const paidContext = () => ({ access: paidAccess(), userId: "user-1" });
const observedD16: readonly StatMatch[] = Array.from({ length: 3 }, (_, index) => ({
  id: `match-${index}`,
  mode: "x01",
  completedAt: `2029-01-0${index + 1}T00:00:00.000Z`,
  result: "won",
  outRule: "double",
  turns: [{
    legNumber: 1,
    scoreBefore: 32,
    scoreAfter: 0,
    bust: false,
    dartsThrown: 1,
    darts: [{ ordinal: 1, segment: 16, multiplier: 2 }],
  }],
}));

describe("POST /api/checkout/advice", () => {
  it("returns advanced routes for an entitled subscriber, private and no-store", async () => {
    const readMatches = vi.fn();
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveContext: async () => paidContext(),
      readMatches,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json() as {
      advice: { checkout: boolean; alternatePlans: unknown[] };
      personalization: unknown;
    };
    expect(body.advice.checkout).toBe(true);
    expect(body.advice.alternatePlans.length).toBeGreaterThan(0);
    expect(body.personalization).toEqual({ status: "off", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 });
    expect(readMatches).not.toHaveBeenCalled();
  });

  it("uses only owned server history to reshape a consented route", async () => {
    const withoutPreference = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 80 }),
      { resolveContext: async () => paidContext() },
    ).then((response) => response.json()) as {
      advice: { primaryPlan: { darts: { segment: number; multiplier: number }[] } };
    };
    expect(withoutPreference.advice.primaryPlan.darts).toEqual([
      expect.objectContaining({ segment: 20, multiplier: 3 }),
      expect.objectContaining({ segment: 10, multiplier: 2 }),
    ]);

    const readMatches = vi.fn(async () => observedD16);
    const preferred = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 80, personalize: true }),
      { resolveContext: async () => paidContext(), readMatches },
    ).then((response) => response.json()) as {
      advice: { primaryPlan: { darts: { segment: number; multiplier: number }[]; reasonCodes: string[] } };
      personalization: { status: string; x01Matches: number; exactDarts: number; finishingDoubles: number };
    };
    expect(preferred.advice.primaryPlan.darts).toEqual([
      expect.objectContaining({ segment: 16, multiplier: 3 }),
      expect.objectContaining({ segment: 16, multiplier: 2 }),
    ]);
    expect(preferred.advice.primaryPlan.reasonCodes).toContain("preferred-double");
    expect(preferred.personalization).toEqual({
      status: "applied", x01Matches: 3, exactDarts: 3, finishingDoubles: 3,
    });
    expect(readMatches).toHaveBeenCalledWith("user-1", 50);
  });

  it("uses the observed double to improve a setup leave", async () => {
    const response = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 169, personalize: true }),
      { resolveContext: async () => paidContext(), readMatches: async () => observedD16 },
    );
    const body = await response.json() as {
      advice: { setupPlan: { leave: number; explanation: string } | null };
    };
    expect(body.advice.setupPlan?.leave).toBe(32);
    expect(body.advice.setupPlan?.explanation).toContain("D16");
  });

  it("keeps standard advice and reports sparse evidence honestly", async () => {
    const response = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 80, personalize: true }),
      { resolveContext: async () => paidContext(), readMatches: async () => [] },
    );
    await expect(response.json()).resolves.toMatchObject({
      advice: { primaryPlan: { darts: [{ segment: 20, multiplier: 3 }, { segment: 10, multiplier: 2 }] } },
      personalization: { status: "sparse", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 },
    });
  });

  it("returns 401 for an anonymous visitor", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveContext: async () => ({ access: accessSnapshot(false, null), userId: null }),
      readMatches: vi.fn(),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("returns 403 for an authenticated Free player", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveContext: async () => ({ access: accessSnapshot(true, null), userId: "user-1" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "advanced_checkout_required" });
  });

  it.each([
    { ...validBody, score: 0 },
    { ...validBody, dartsAvailable: 4 },
    { ...validBody, outRule: "triple" },
    { score: 80, dartsAvailable: 2, outRule: "double" },
    { ...validBody, preferredDoubles: [16] },
    { ...validBody, entitlements: ["advanced_checkout"] },
  ])("rejects malformed request %#", async (body) => {
    const response = await handleCheckoutAdviceRequest(request(body), {
      resolveContext: async () => paidContext(),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_checkout_request" });
  });

  it.each([new AccessServiceError(), new AuthServiceError()])(
    "returns 503 when access authority is indeterminate",
    async (failure) => {
      const response = await handleCheckoutAdviceRequest(request(validBody), {
        resolveContext: async () => { throw failure; },
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "access_status_unavailable" });
    },
  );

  it("keeps standard Pro advice when optional history cannot be read", async () => {
    const response = await handleCheckoutAdviceRequest(
      request({ ...validBody, personalize: true }),
      {
        resolveContext: async () => paidContext(),
        readMatches: async () => { throw new MatchHistoryError(); },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      advice: { score: 141, dartsAvailable: 3 },
      personalization: { status: "unavailable", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 },
    });
  });

  it("sanitizes unexpected failures", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveContext: async () => { throw new Error("sensitive internal detail"); },
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "checkout_advice_failed" });
  });
});
