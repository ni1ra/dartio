import { describe, expect, it, vi } from "vitest";
import { checkoutAdvice } from "@/domain";
import { CheckoutAdviceClientError, requestAdvancedCheckoutAdvice } from "./checkout-advice-client";

const position = { score: 141, dartsAvailable: 3, outRule: "double" } as const;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("requestAdvancedCheckoutAdvice", () => {
  it("returns a server advice payload that round-trips the domain shape", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(141, 3, "double")));
    const fetcher = vi.fn(async () => ok({ advice }));
    await expect(requestAdvancedCheckoutAdvice(position, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toEqual(advice);
  });

  it("posts preferences only when they carry a value", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(40, 3, "double")));
    const fetcher = vi.fn(async () => ok({ advice }));
    await requestAdvancedCheckoutAdvice(
      { ...position, preferences: { preferredDoubles: [], avoidBull: true } },
      { fetcher: fetcher as unknown as typeof fetch },
    );
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ score: 141, dartsAvailable: 3, outRule: "double", avoidBull: true });
  });

  it("rejects a tampered route rather than rendering an illegal dart", async () => {
    const advice = JSON.parse(JSON.stringify(checkoutAdvice(40, 3, "double")));
    advice.primaryPlan.darts[0].score = 999;
    const fetcher = vi.fn(async () => ok({ advice }));
    await expect(requestAdvancedCheckoutAdvice(position, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toThrow(new CheckoutAdviceClientError("invalid_response", 200));
  });

  it.each([
    [401, "authentication_required"],
    [403, "advanced_checkout_required"],
    [503, "access_status_unavailable"],
  ] as const)("surfaces the %i denial code", async (status, error) => {
    const fetcher = vi.fn(async () => fail(status, { error }));
    await expect(requestAdvancedCheckoutAdvice(position, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: error, status });
  });

  it("reports a transport failure without inventing advice", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("offline"); });
    await expect(requestAdvancedCheckoutAdvice(position, { fetcher: fetcher as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: "network_error", status: null });
  });
});
