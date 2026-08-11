import { afterEach, describe, expect, it, vi } from "vitest";
import { representativePoint } from "@/domain/darts";
import { AiThrowClientError, requestPremiumAiThrow } from "./ai-throw-client";

const input = { level: 20, target: { segment: 20, multiplier: 2 } } as const;
const positionedDouble = {
  segment: 20,
  multiplier: 2,
  score: 40,
  ...representativePoint({ segment: 20, multiplier: 2 }),
};

afterEach(() => vi.restoreAllMocks());

describe("requestPremiumAiThrow", () => {
  it("sends only the locked request and returns one positioned dart", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ dart: positionedDouble }));
    const widerInput = { ...input, mode: "x01", seed: 5519 };
    await expect(requestPremiumAiThrow(widerInput, { fetcher })).resolves.toEqual(positionedDouble);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/ai/throw");
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("accepts a physically consistent off-board miss", async () => {
    const miss = { segment: 0, multiplier: 1, score: 0, x: 0, y: -1.05 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ dart: miss }));
    await expect(requestPremiumAiThrow(input, { fetcher })).resolves.toEqual(miss);
  });

  it.each([
    { label: "old visit response", payload: { darts: [positionedDouble] } },
    { label: "missing coordinates", payload: { dart: { segment: 20, multiplier: 2, score: 40 } } },
    { label: "inconsistent score", payload: { dart: { ...positionedDouble, score: 20 } } },
    { label: "physically inconsistent coordinates", payload: { dart: { ...positionedDouble, x: 0, y: 0 } } },
    { label: "invalid miss multiplier", payload: { dart: { ...positionedDouble, segment: 0, multiplier: 2, score: 0 } } },
    { label: "invalid bull multiplier", payload: { dart: { ...positionedDouble, segment: 25, multiplier: 3, score: 75 } } },
    { label: "extra response field", payload: { dart: positionedDouble, plan: "pro" } },
    { label: "extra dart field", payload: { dart: { ...positionedDouble, aim: "D20" } } },
  ])("rejects a $label", async ({ payload }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("rejects non-finite JSON coordinates", async () => {
    const response = new Response(
      '{"dart":{"segment":20,"multiplier":2,"score":40,"x":1e999,"y":0}}',
      { headers: { "content-type": "application/json" } },
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it.each([
    [400, { error: "invalid_ai_throw" }, "invalid_ai_throw"],
    [401, { error: "authentication_required" }, "authentication_required"],
    [403, { error: "advanced_ai_required", maxLevel: 8 }, "advanced_ai_required"],
    [503, { error: "access_status_unavailable" }, "access_status_unavailable"],
    [500, { error: "ai_throw_failed" }, "ai_throw_failed"],
  ] as const)("maps HTTP %s to %s", async (status, payload, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload, { status }));
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toEqual(
      expect.objectContaining({ code, status }),
    );
  });

  it("does not trust a malformed or embellished error body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      error: "advanced_ai_required",
      maxLevel: 8,
      internal: "detail",
    }, { status: 403 }));
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toMatchObject({
      code: "ai_throw_failed",
      status: 403,
    });
  });

  it("maps transport failure without leaking its message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive network detail"));
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toEqual(
      expect.objectContaining({ code: "network_error", status: null }),
    );
  });

  it("preserves a fetch AbortError instead of turning it into recovery", async () => {
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(aborted);
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toBe(aborted);
  });

  it("preserves an AbortError raised while reading the response", async () => {
    const aborted = new DOMException("Aborted", "AbortError");
    const response = Response.json({ dart: positionedDouble });
    vi.spyOn(response, "json").mockRejectedValue(aborted);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(requestPremiumAiThrow(input, { fetcher })).rejects.toBe(aborted);
  });

  it("uses a typed invalid-response error", () => {
    expect(new AiThrowClientError("invalid_response", 200)).toMatchObject({
      name: "AiThrowClientError",
      code: "invalid_response",
      status: 200,
    });
  });
});
