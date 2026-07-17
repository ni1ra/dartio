import { describe, expect, it } from "vitest";
import { authEnvSchema, billingEnvSchema, getAuthEnv, getBillingCheckoutEnv, serverEnvSchema } from "./server";

const valid = {
  DATABASE_URL: "postgresql://user:password@example.neon.tech/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: "https://example.neonauth.example/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "a-secure-cookie-secret-that-is-32-characters",
  OPENAI_API_KEY: "sk-example-not-a-real-secret-value",
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_annual",
  NEXT_PUBLIC_APP_URL: "https://dartio.app",
};

describe("server environment", () => {
  it("accepts production origins and canonicalizes a trailing slash", () => expect(serverEnvSchema.parse({ ...valid, NEXT_PUBLIC_APP_URL: "https://dartio.app/" }).NEXT_PUBLIC_APP_URL).toBe("https://dartio.app"));
  it("accepts local HTTP development", () => expect(serverEnvSchema.safeParse({ ...valid, NEXT_PUBLIC_APP_URL: "http://localhost:3000" }).success).toBe(true));
  it("auth validates without unrelated database, billing, or voice configuration", () => {
    const authOnly = { NEON_AUTH_BASE_URL: valid.NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET: valid.NEON_AUTH_COOKIE_SECRET };
    expect(getAuthEnv(authOnly)).toEqual(authOnly);
    expect(authEnvSchema.safeParse(authOnly).success).toBe(true);
  });
  it("checkout validates without auth, database, voice, or webhook configuration", () => {
    const checkoutOnly = { STRIPE_SECRET_KEY: valid.STRIPE_SECRET_KEY, STRIPE_PRO_MONTHLY_PRICE_ID: valid.STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID: valid.STRIPE_PRO_ANNUAL_PRICE_ID, NEXT_PUBLIC_APP_URL: valid.NEXT_PUBLIC_APP_URL };
    expect(getBillingCheckoutEnv(checkoutOnly)).toEqual(checkoutOnly);
  });
  it.each(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID", "NEXT_PUBLIC_APP_URL"] as const)("full billing contract rejects missing %s", (key) => {
    const incomplete: Record<string, string | undefined> = { ...valid };
    delete incomplete[key];
    expect(billingEnvSchema.safeParse(incomplete).success).toBe(false);
  });
  it.each([
    ["weak cookie", { NEON_AUTH_COOKIE_SECRET: "too-short" }],
    ["insecure auth", { NEON_AUTH_BASE_URL: "http://auth.example.com" }],
    ["non-local HTTP", { NEXT_PUBLIC_APP_URL: "http://dartio.app" }],
    ["path", { NEXT_PUBLIC_APP_URL: "https://dartio.app/app" }],
    ["query", { NEXT_PUBLIC_APP_URL: "https://dartio.app?next=bad" }],
    ["credentials", { NEXT_PUBLIC_APP_URL: "https://user:pass@dartio.app" }],
  ])("rejects %s configuration", (_label, value) => expect(serverEnvSchema.safeParse({ ...valid, ...value }).success).toBe(false));
});
