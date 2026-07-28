import { afterEach, describe, expect, it, vi } from "vitest";
import { beginCheckout } from "./billing-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("beginCheckout", () => {
  it.each([
    ["pro", "month"],
    ["club", "year"],
  ] as const)("sends the selected %s plan and %s interval", async (plan, interval) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(beginCheckout(plan, interval)).resolves.toBe("https://checkout.stripe.test/session");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/billing/checkout");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ plan, interval });
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("opens the billing Portal when Checkout reports an active subscription", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recovery: "portal" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://billing.stripe.test/portal" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(beginCheckout("pro", "year")).resolves.toBe("https://billing.stripe.test/portal");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/billing/portal", { method: "POST" });
  });
});
