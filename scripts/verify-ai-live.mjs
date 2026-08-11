#!/usr/bin/env node
/*
 * Application-data-safe release gate for the paid, mode-blind AI boundary.
 *
 * This signs in an existing QA identity and samples physical darts only. It does
 * not create accounts, matches, billing/product rows, or accept a database
 * credential. Sign-in does create the ordinary short-lived auth session needed
 * to reach the paid boundary; no gate that genuinely authenticates can avoid it.
 * DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD come from the environment so neither
 * pnpm's command echo nor this script can expose them as positional arguments.
 *
 *   pnpm verify:ai:live https://dartioopus46.vercel.app
 */
import {
  hasPrivateNoStore,
  isPlausiblyAimedSample,
  LIVE_AI_SAMPLE_SIZE,
  parsePhysicallyConsistentDart,
  resolveLiveAiConfiguration,
} from "./verify-ai-live-config.mjs";

const configuration = resolveLiveAiConfiguration(process.argv.slice(2), process.env);
if (!configuration.ok) {
  console.error(configuration.message);
  process.exit(2);
}
const { origin, email, password } = configuration;
const validThrow = { level: 20, target: { segment: 20, multiplier: 3 } };

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function request(path, init, label) {
  try {
    return await fetch(`${origin}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail(`${label} could not reach the validated deployment`);
  }
}

async function json(response) {
  return await response.json().catch(() => null);
}

function assertPrivateNoStore(response, label) {
  if (!hasPrivateNoStore(response.headers.get("cache-control"))) {
    fail(`${label} did not return Cache-Control: private, no-store`);
  }
}

function hasExactError(payload, error) {
  return typeof payload === "object"
    && payload !== null
    && !Array.isArray(payload)
    && Object.keys(payload).length === 1
    && payload.error === error;
}

async function postThrow(body, cookie, label) {
  return await request("/api/ai/throw", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  }, label);
}

const anonymous = await postThrow(validThrow, null, "anonymous AI throw");
assertPrivateNoStore(anonymous, "anonymous AI throw");
const anonymousBody = await json(anonymous);
if (
  anonymous.status !== 401
  || !hasExactError(anonymousBody, "authentication_required")
) {
  fail(`anonymous AI throw returned ${anonymous.status}, expected 401 authentication_required`);
}
console.log("OK   an anonymous level-20 throw is refused (401)");

const signIn = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email, password }),
}, "QA sign-in");
if (!signIn.ok) fail(`existing QA sign-in returned ${signIn.status}`);
const cookie = signIn.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");
if (!cookie) fail("existing QA sign-in issued no session cookie");
console.log("OK   authenticated the existing QA identity");

const representativeTargets = [
  ["single", { segment: 20, multiplier: 1 }],
  ["double", { segment: 20, multiplier: 2 }],
  ["treble", { segment: 20, multiplier: 3 }],
  ["single bull", { segment: 25, multiplier: 1 }],
  ["double bull", { segment: 25, multiplier: 2 }],
];
for (const [label, target] of representativeTargets) {
  const darts = [];
  for (let sample = 0; sample < LIVE_AI_SAMPLE_SIZE; sample += 1) {
    const response = await postThrow({ level: 20, target }, cookie, `${label} target`);
    assertPrivateNoStore(response, `${label} target`);
    if (response.status === 403) {
      fail("the QA identity is authenticated but is not entitled to advanced_ai (403)");
    }
    if (response.status !== 200) fail(`${label} target returned ${response.status}, expected 200`);
    const dart = parsePhysicallyConsistentDart(await json(response));
    if (!dart) fail(`${label} target did not return exactly one physically consistent dart`);
    darts.push(dart);
  }
  if (!isPlausiblyAimedSample(darts, target)) {
    fail(`${label} target sample was not centered on the requested scoring bed`);
  }
  console.log(`OK   level 20 ${label} target returned ${LIVE_AI_SAMPLE_SIZE} physical darts centered on its requested bed`);
}

const invalidRequests = [
  ["level 8", { ...validThrow, level: 8 }],
  ["mode extra", { ...validThrow, mode: "x01" }],
  ["rule extra", { ...validThrow, outRule: "double" }],
  ["seed extra", { ...validThrow, clientSeed: 5519 }],
];
for (const [label, body] of invalidRequests) {
  const response = await postThrow(body, cookie, label);
  assertPrivateNoStore(response, label);
  const payload = await json(response);
  if (
    response.status !== 400
    || !hasExactError(payload, "invalid_ai_throw")
  ) {
    fail(`${label} returned ${response.status}, expected 400 invalid_ai_throw`);
  }
  console.log(`OK   ${label} is refused before execution (400)`);
}

console.log(`OK   ${origin} passed the application-data-safe live AI boundary`);
