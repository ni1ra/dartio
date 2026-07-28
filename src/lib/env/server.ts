import { z } from "zod";

const databaseUrl = z.url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), "Must be a PostgreSQL URL");
const authBaseUrl = z.url().refine((value) => value.startsWith("https://"), "Neon Auth must use HTTPS");
const appOrigin = z.url().transform((value, context) => {
  const url = new URL(value);
  if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) {
    context.addIssue({ code: "custom", message: "App URL must be an HTTPS origin (HTTP is allowed only for localhost)" });
    return z.NEVER;
  }
  return url.origin;
});

export const databaseEnvSchema = z.object({ DATABASE_URL: databaseUrl });
export const authEnvSchema = z.object({ NEON_AUTH_BASE_URL: authBaseUrl, NEON_AUTH_COOKIE_SECRET: z.string().min(32) });
export const voiceEnvSchema = z.object({ OPENAI_API_KEY: z.string().min(20) });
export const stripeClientEnvSchema = z.object({ STRIPE_SECRET_KEY: z.string().startsWith("sk_") });
export const billingPriceEnvSchema = z.object({ STRIPE_PRO_MONTHLY_PRICE_ID: z.string().startsWith("price_"), STRIPE_PRO_ANNUAL_PRICE_ID: z.string().startsWith("price_"), STRIPE_CLUB_MONTHLY_PRICE_ID: z.string().startsWith("price_"), STRIPE_CLUB_ANNUAL_PRICE_ID: z.string().startsWith("price_") });
export const billingCheckoutEnvSchema = stripeClientEnvSchema.merge(billingPriceEnvSchema).extend({ NEXT_PUBLIC_APP_URL: appOrigin });
export const billingPortalEnvSchema = stripeClientEnvSchema.extend({ NEXT_PUBLIC_APP_URL: appOrigin });
export const billingWebhookEnvSchema = stripeClientEnvSchema.merge(billingPriceEnvSchema).extend({ STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_") });
export const billingEnvSchema = billingCheckoutEnvSchema.merge(billingWebhookEnvSchema);
export const serverEnvSchema = databaseEnvSchema.merge(authEnvSchema).merge(voiceEnvSchema).merge(billingEnvSchema);

type Source = Record<string, string | undefined>;
export function getDatabaseEnv(source: Source = process.env) { return databaseEnvSchema.parse(source); }
export function getAuthEnv(source: Source = process.env) { return authEnvSchema.parse(source); }
export function getVoiceEnv(source: Source = process.env) { return voiceEnvSchema.parse(source); }
export function getBillingCheckoutEnv(source: Source = process.env) { return billingCheckoutEnvSchema.parse(source); }
export function getBillingPortalEnv(source: Source = process.env) { return billingPortalEnvSchema.parse(source); }
export function getBillingWebhookEnv(source: Source = process.env) { return billingWebhookEnvSchema.parse(source); }
export function getServerEnv(source: Source = process.env) { return serverEnvSchema.parse(source); }
