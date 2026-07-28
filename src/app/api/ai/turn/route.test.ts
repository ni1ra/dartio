import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getCurrentUser: vi.fn() }));
import { AccessServiceError, accessSnapshot } from "@/lib/server/access";
import { AuthServiceError } from "@/lib/server/identity";
import { handleAiTurnRequest } from "./route";

const validBody = {
  level: 20,
  score: 40,
  opened: true,
  inRule: "straight",
  outRule: "double",
};
const request = (body: unknown) => new Request("https://dartio.test/api/ai/turn", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/ai/turn", () => {
  it("returns a private no-store premium visit", async () => {
    const paid = accessSnapshot(true, {
      plan: "pro",
      status: "active",
      currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }, new Date("2029-01-01T00:00:00.000Z"));
    const response = await handleAiTurnRequest(request(validBody), {
      resolveAccess: async () => paid,
      random: () => 1,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      darts: [expect.objectContaining({ segment: 20, multiplier: 2, score: 40, x: expect.any(Number), y: expect.any(Number) })],
    });
  });

  it("returns a legal single-one straight-out visit", async () => {
    const paid = accessSnapshot(true, {
      plan: "pro",
      status: "active",
      currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
      cancelAt: null,
      cancelAtPeriodEnd: false,
    }, new Date("2029-01-01T00:00:00.000Z"));
    const response = await handleAiTurnRequest(request({
      ...validBody,
      score: 1,
      outRule: "straight",
    }), { resolveAccess: async () => paid, random: () => 1 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      darts: [expect.objectContaining({ segment: 1, multiplier: 1, score: 1 })],
    });
  });

  it.each([
    { body: { ...validBody, level: 8 }, label: "out-of-range level" },
    { body: { ...validBody, clientSeed: 5519 }, label: "unknown client seed" },
    { body: { ...validBody, score: 1 }, label: "impossible double-out score one" },
  ])("returns 400 for $label", async ({ body }) => {
    const response = await handleAiTurnRequest(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "invalid_ai_turn" });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await handleAiTurnRequest(new Request("https://dartio.test/api/ai/turn", {
      method: "POST",
      body: "{",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_ai_turn" });
  });

  it("returns 401 for an anonymous snapshot", async () => {
    const response = await handleAiTurnRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(false, null),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("returns 403 with the Free ceiling for an authenticated non-subscriber", async () => {
    const response = await handleAiTurnRequest(request(validBody), {
      resolveAccess: async () => accessSnapshot(true, null),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "advanced_ai_required", maxLevel: 8 });
  });

  it.each([new AccessServiceError(), new AuthServiceError()])(
    "returns 503 when access authority is indeterminate",
    async (failure) => {
      const response = await handleAiTurnRequest(request(validBody), {
        resolveAccess: async () => { throw failure; },
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ error: "access_status_unavailable" });
    },
  );

  it("sanitizes unexpected failures", async () => {
    const response = await handleAiTurnRequest(request(validBody), {
      resolveAccess: async () => { throw new Error("sensitive internal detail"); },
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "ai_turn_failed" });
  });
});
