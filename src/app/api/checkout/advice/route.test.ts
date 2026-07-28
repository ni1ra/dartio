import { describe, expect, it } from "vitest";

import { vi } from "vitest";
vi.mock("@/lib/server/auth", () => ({ getCurrentUser: vi.fn() }));
import { AccessServiceError, accessSnapshot } from "@/lib/server/access";
import { AuthServiceError } from "@/lib/server/identity";
import { handleCheckoutAdviceRequest } from "./route";

const validBody = { score: 141, dartsAvailable: 3, outRule: "double" };
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

describe("POST /api/checkout/advice", () => {
  it("returns advanced routes for an entitled subscriber, private and no-store", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveAccess: async () => paidAccess(),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json() as { advice: { checkout: boolean; alternatePlans: unknown[] } };
    expect(body.advice.checkout).toBe(true);
    expect(body.advice.alternatePlans.length).toBeGreaterThan(0);
  });

  it("lets preferences reshape the route", async () => {
    const withoutPreference = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 40 }),
      { resolveAccess: async () => paidAccess() },
    ).then((response) => response.json()) as { advice: { primaryPlan: { darts: { segment: number }[] } } };
    // 40 finishes on D20 by default; asking for D10 must route through S20 D10.
    expect(withoutPreference.advice.primaryPlan.darts).toEqual([
      expect.objectContaining({ segment: 20, multiplier: 2 }),
    ]);

    const preferred = await handleCheckoutAdviceRequest(
      request({ ...validBody, score: 40, preferredDoubles: [10] }),
      { resolveAccess: async () => paidAccess() },
    ).then((response) => response.json()) as {
      advice: { primaryPlan: { darts: { segment: number; multiplier: number }[]; reasonCodes: string[] } };
    };
    expect(preferred.advice.primaryPlan.darts.at(-1)).toMatchObject({ segment: 10, multiplier: 2 });
    expect(preferred.advice.primaryPlan.reasonCodes).toContain("preferred-double");
  });

  it("returns 401 for an anonymous visitor", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(false, null),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("returns 403 for an authenticated Free player", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(true, null),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "advanced_checkout_required" });
  });

  it.each([
    { ...validBody, score: 0 },
    { ...validBody, dartsAvailable: 4 },
    { ...validBody, outRule: "triple" },
    { ...validBody, preferredTrebles: [21] },
    { ...validBody, entitlements: ["advanced_checkout"] },
  ])("rejects malformed request %#", async (body) => {
    const response = await handleCheckoutAdviceRequest(request(body), {
      resolveAccess: async () => paidAccess(),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_checkout_request" });
  });

  it.each([new AccessServiceError(), new AuthServiceError()])(
    "returns 503 when access authority is indeterminate",
    async (failure) => {
      const response = await handleCheckoutAdviceRequest(request(validBody), {
        resolveAccess: async () => { throw failure; },
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "access_status_unavailable" });
    },
  );

  it("sanitizes unexpected failures", async () => {
    const response = await handleCheckoutAdviceRequest(request(validBody), {
      resolveAccess: async () => { throw new Error("sensitive internal detail"); },
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "checkout_advice_failed" });
  });
});
