import { describe, expect, it, vi } from "vitest";
import { checkoutAdvice } from "@/domain";
import { CheckoutAdviceClientError, requestAdvancedCheckoutAdvice } from "./checkout-advice-client";

const position = { score: 141, dartsAvailable: 3, outRule: "double" } as const;
const off = { status: "off", x01Matches: 0, exactDarts: 0, finishingDoubles: 0 } as const;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("requestAdvancedCheckoutAdvice", () => {
  it("returns a server advice payload that round-trips the domain shape", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(141, 3, "double")));
    const fetcher = vi.fn(async () => ok({ advice, personalization: off }));
    await expect(requestAdvancedCheckoutAdvice({ ...position, personalize: false }, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toEqual({ advice, personalization: off });
  });

  it("posts consent but never client-derived preferences", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(141, 3, "double")));
    const fetcher = vi.fn(async () => ok({
      advice,
      personalization: { status: "sparse", x01Matches: 2, exactDarts: 12, finishingDoubles: 1 },
    }));
    await requestAdvancedCheckoutAdvice(
      { ...position, personalize: true },
      { fetcher: fetcher as unknown as typeof fetch },
    );
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ score: 141, dartsAvailable: 3, outRule: "double", personalize: true });
  });

  it("rejects a tampered route rather than rendering an illegal dart", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(40, 3, "double")));
    advice.primaryPlan.darts[0].score = 999;
    const fetcher = vi.fn(async () => ok({ advice, personalization: off }));
    await expect(requestAdvancedCheckoutAdvice({ ...position, personalize: false }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow(new CheckoutAdviceClientError("invalid_response", 200));
  });

  it("rejects valid advice returned for another live position", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(80, 2, "double")));
    const fetcher = vi.fn(async () => ok({ advice, personalization: off }));
    await expect(requestAdvancedCheckoutAdvice(
      { ...position, personalize: false },
      { fetcher: fetcher as unknown as typeof fetch },
    )).rejects.toThrow(new CheckoutAdviceClientError("invalid_response", 200));
  });

  it.each([
    { ...off, status: "off", exactDarts: 1 },
    { ...off, status: "unavailable", x01Matches: 1 },
    { status: "sparse", x01Matches: 1, exactDarts: 2, finishingDoubles: 3 },
    { status: "applied", x01Matches: 0, exactDarts: 45, finishingDoubles: 0 },
  ])("rejects contradictory personalization evidence %#", async (personalization) => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(40, 3, "double")));
    const fetcher = vi.fn(async () => ok({ advice, personalization }));
    await expect(requestAdvancedCheckoutAdvice(
      { ...position, personalize: true },
      { fetcher: fetcher as unknown as typeof fetch },
    )).rejects.toThrow(new CheckoutAdviceClientError("invalid_response", 200));
  });

  it.each([
    [401, "authentication_required"],
    [403, "advanced_checkout_required"],
    [503, "access_status_unavailable"],
  ] as const)("surfaces the %i denial code", async (status, error) => {
    const fetcher = vi.fn(async () => fail(status, { error }));
    await expect(requestAdvancedCheckoutAdvice({ ...position, personalize: false }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: error, status });
  });

  it("reports a transport failure without inventing advice", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("offline"); });
    await expect(requestAdvancedCheckoutAdvice({ ...position, personalize: false }, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "network_error", status: null });
  });
});
