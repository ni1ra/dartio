import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getCurrentUser: vi.fn() }));
import { AccessServiceError, accessSnapshot, type AccessSnapshot } from "@/lib/server/access";
import { AuthServiceError } from "@/lib/server/identity";
import { handleAiThrowRequest } from "./route";

const validBody = {
  level: 20,
  target: { segment: 20, multiplier: 3 },
};
const request = (body: unknown) => new Request("https://dartio.test/api/ai/throw", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const paidAccess = (): AccessSnapshot => accessSnapshot(true, {
  plan: "pro",
  status: "active",
  currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
  cancelAt: null,
  cancelAtPeriodEnd: false,
}, new Date("2029-01-01T00:00:00.000Z"));

describe("POST /api/ai/throw", () => {
  it("returns exactly one private, no-store, physically scored dart", async () => {
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => paidAccess(),
      random: () => 1,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      dart: { segment: 20, multiplier: 3, score: 60, x: 0, y: expect.any(Number) },
    });
  });

  it.each([
    { label: "single", target: { segment: 7, multiplier: 1 }, score: 7 },
    { label: "double", target: { segment: 16, multiplier: 2 }, score: 32 },
    { label: "treble", target: { segment: 19, multiplier: 3 }, score: 57 },
    { label: "single bull", target: { segment: 25, multiplier: 1 }, score: 25 },
    { label: "double bull", target: { segment: 25, multiplier: 2 }, score: 50 },
  ])("accepts the legal $label target", async ({ target, score }) => {
    const response = await handleAiThrowRequest(request({ ...validBody, target }), {
      resolveAccess: async () => paidAccess(),
      random: () => 1,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dart: expect.objectContaining({
        segment: target.segment,
        multiplier: target.multiplier,
        score,
      }),
    });
  });

  it.each([
    { body: { ...validBody, level: 8 }, label: "out-of-range level" },
    { body: { ...validBody, level: 12.5 }, label: "fractional level" },
    { body: { ...validBody, target: { segment: 0, multiplier: 1 } }, label: "miss target" },
    { body: { ...validBody, target: { segment: 21, multiplier: 1 } }, label: "nonexistent segment" },
    { body: { ...validBody, target: { segment: 25, multiplier: 3 } }, label: "treble bull" },
    { body: { ...validBody, target: { segment: 20, multiplier: 4 } }, label: "nonexistent multiplier" },
    { body: { ...validBody, target: { segment: 20, multiplier: 3, score: 60 } }, label: "extra target claim" },
    { body: { ...validBody, mode: "x01" }, label: "extra rules claim" },
    { body: { ...validBody, score: 501, inRule: "straight" }, label: "X01 position claim" },
    { body: { ...validBody, plan: "pro", entitlements: ["advanced_ai"] }, label: "access claim" },
    { body: { ...validBody, clientSeed: 5519 }, label: "client random seed" },
  ])("returns private no-store 400 for $label", async ({ body }) => {
    const resolveAccess = vi.fn(async () => paidAccess());
    const response = await handleAiThrowRequest(request(body), { resolveAccess });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "invalid_ai_throw" });
    expect(resolveAccess).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await handleAiThrowRequest(new Request("https://dartio.test/api/ai/throw", {
      method: "POST",
      body: "{",
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "invalid_ai_throw" });
  });

  it("returns 401 for an anonymous snapshot", async () => {
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(false, null),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("returns 403 for an authenticated Free snapshot", async () => {
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(true, null),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "advanced_ai_required", maxLevel: 8 });
  });

  it("returns 403 when canonical availability says the feature is unimplemented", async () => {
    const paid = paidAccess();
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => ({
        ...paid,
        availability: { ...paid.availability, advancedAi: "coming_soon" },
      }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "advanced_ai_required", maxLevel: 8 });
  });

  it.each([new AccessServiceError(), new AuthServiceError()])(
    "returns private no-store 503 when access authority is indeterminate",
    async (failure) => {
      const response = await handleAiThrowRequest(request(validBody), {
        resolveAccess: async () => { throw failure; },
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ error: "access_status_unavailable" });
    },
  );

  it("sanitizes unexpected failures", async () => {
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => paidAccess(),
      random: () => { throw new Error("sensitive internal detail"); },
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "ai_throw_failed" });
  });

  it("does not mistake a downstream SyntaxError for malformed request JSON", async () => {
    const response = await handleAiThrowRequest(request(validBody), {
      resolveAccess: async () => paidAccess(),
      random: () => { throw new SyntaxError("sensitive downstream detail"); },
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "ai_throw_failed" });
  });
});
