#!/usr/bin/env node
/*
 * Release gate: can anyone actually sign in to this deployment?
 *
 * Neon Auth enforces a trusted-origin list on its own service, so an app can be
 * deployed, healthy, and serving 200s on every route while authentication is
 * completely dead — which is exactly what happened to production. Every browser
 * test passed because they exercise free play, and the entitlement test
 * deliberately tolerates an unavailable access authority so it can run against
 * CI placeholders. That tolerance made the suite blind to this.
 *
 * This probes the sign-up endpoint with a throwaway address and asserts only
 * that the origin was accepted. A 403 INVALID_ORIGIN means the deployment's URL
 * is missing from the Neon Auth project's trusted domains.
 *
 *   node scripts/verify-production-auth.mjs https://dartioopus46.vercel.app
 */
const target = process.argv[2] ?? process.env.DARTIO_BASE_URL;
if (!target) {
  console.error("usage: verify-production-auth.mjs <base-url>");
  process.exit(2);
}

const origin = new URL(target).origin;
const response = await fetch(`${origin}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({
    // Never completes: the address is unroutable and the password is rejected
    // for length. Reaching a validation error proves the origin was accepted.
    email: `origin-probe-${Date.now()}@dartio.invalid`,
    password: "x",
    name: "Origin probe",
  }),
});

const body = await response.json().catch(() => ({}));
if (response.status === 403 && body?.code === "INVALID_ORIGIN") {
  console.error(`FAIL ${origin} is not a trusted origin for this Neon Auth project.`);
  console.error("     Nobody can sign in or sign up. Add it to the project's trusted domains.");
  process.exit(1);
}

console.log(`OK   ${origin} is accepted by Neon Auth (status ${response.status}).`);
