import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTurnClientError, projectDartMarker, requestPremiumAiTurn } from "./ai-turn-client";

const input = { level: 20, score: 40, opened: true, inRule: "straight", outRule: "double" } as const;
const positionedDouble = { segment: 20, multiplier: 2, score: 40, x: 0.25, y: -0.9 };

afterEach(() => vi.restoreAllMocks());

describe("requestPremiumAiTurn", () => {
  it("sends only the locked request and returns positioned darts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ darts: [positionedDouble] }));
    await expect(requestPremiumAiTurn(input, { fetcher })).resolves.toEqual([positionedDouble]);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/ai/turn");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it.each([
    { label: "missing coordinates", payload: { darts: [{ segment: 20, multiplier: 2, score: 40 }] } },
    { label: "inconsistent score", payload: { darts: [{ ...positionedDouble, score: 20 }] } },
    { label: "too many darts", payload: { darts: Array.from({ length: 4 }, () => positionedDouble) } },
    { label: "extra response field", payload: { darts: [positionedDouble], plan: "pro" } },
  ])("rejects a $label response", async ({ payload }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(requestPremiumAiTurn(input, { fetcher })).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });

  it.each([
    [401, "authentication_required"],
    [403, "advanced_ai_required"],
    [503, "access_status_unavailable"],
    [500, "ai_turn_failed"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: code }, { status }));
    await expect(requestPremiumAiTurn(input, { fetcher })).rejects.toEqual(expect.objectContaining({ code, status }));
  });

  it("maps transport failure without leaking its message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive network detail"));
    await expect(requestPremiumAiTurn(input, { fetcher })).rejects.toEqual(expect.objectContaining({ code: "network_error", status: null }));
  });

  it("preserves cancellation instead of turning it into recovery", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("Aborted", "AbortError");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(aborted);
    await expect(requestPremiumAiTurn(input, { signal: controller.signal, fetcher })).rejects.toBe(aborted);
  });

  it("uses a typed invalid-response error", () => {
    expect(new AiTurnClientError("invalid_response", 200)).toMatchObject({ name: "AiTurnClientError", code: "invalid_response", status: 200 });
  });
});

describe("projectDartMarker", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 0.4, y: -0.7 },
    { x: 1.02, y: 0 },
  ])("leaves origin and visible points unchanged", (point) => {
    expect(projectDartMarker(point)).toMatchObject({ ...point, capped: false });
  });

  it("marks a near-rim miss without moving it", () => {
    expect(projectDartMarker({ x: 1.03, y: 0 })).toEqual({ x: 1.03, y: 0, offBoard: true, capped: false });
  });

  it("caps a distant miss at the visible rim while preserving direction", () => {
    const source = { x: 3, y: 4 };
    const projected = projectDartMarker(source);
    expect(Math.hypot(projected.x, projected.y)).toBeCloseTo(1.06, 10);
    expect(projected.x * source.y - projected.y * source.x).toBeCloseTo(0, 10);
    expect(projected).toMatchObject({ offBoard: true, capped: true });
  });

  it("fails visually safe for non-finite local coordinates", () => {
    expect(projectDartMarker({ x: Number.POSITIVE_INFINITY, y: 1 })).toEqual({ x: 0, y: 0, offBoard: true, capped: true });
  });
});
