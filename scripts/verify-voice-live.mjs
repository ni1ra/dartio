#!/usr/bin/env node
/*
 * Application-data-safe release gate for the paid voice boundary.
 *
 * The checked-in audio is synthetic Windows text-to-speech, not a person's
 * recorded voice. This script signs in an existing QA identity and sends one
 * short clip to OpenAI through Dartio. It prints no audio, transcript, model
 * token, confidence value, cookie, or credential. Sign-in creates only the
 * ordinary short-lived auth session required to exercise the boundary.
 *
 *   pnpm verify:voice:live https://dartioopus46.vercel.app
 */
import { readFile } from "node:fs/promises";
import {
  classifyTrebleTwentyVoiceSuccess,
  hasPrivateNoStore,
  resolveLiveVoiceConfiguration,
} from "./verify-voice-live-config.mjs";

const configuration = resolveLiveVoiceConfiguration(process.argv.slice(2), process.env);
if (!configuration.ok) {
  console.error(configuration.message);
  process.exit(2);
}
const { origin, email, password } = configuration;

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function request(path, init, label) {
  try {
    return await fetch(`${origin}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(40_000),
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

function voiceForm(audio) {
  const form = new FormData();
  if (audio) form.append("audio", new Blob([audio], { type: "audio/wav" }), "voice-treble-twenty.wav");
  form.append("language", "en");
  return form;
}

async function postVoice(audio, cookie, label) {
  return await request("/api/voice/transcribe", {
    method: "POST",
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: voiceForm(audio),
  }, label);
}

const fixtureText = await readFile(
  new URL("./fixtures/voice-treble-twenty.wav.b64", import.meta.url),
  "utf8",
);
const fixture = Buffer.from(fixtureText.replace(/\s+/g, ""), "base64");
if (
  fixture.length === 0
  || fixture.length > 64 * 1024
  || fixture.subarray(0, 4).toString("ascii") !== "RIFF"
  || fixture.subarray(8, 12).toString("ascii") !== "WAVE"
) {
  fail("the checked-in synthetic voice fixture is invalid");
}

const anonymous = await postVoice(fixture, null, "anonymous voice transcription");
assertPrivateNoStore(anonymous, "anonymous voice transcription");
if (
  anonymous.status !== 401
  || !hasExactError(await json(anonymous), "authentication_required")
) {
  fail(`anonymous voice transcription returned ${anonymous.status}, expected 401 authentication_required`);
}
console.log("OK   an anonymous voice transcription is refused (401)");

const signIn = await request("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email, password }),
}, "QA sign-in");
if (!signIn.ok) fail(`existing QA sign-in returned ${signIn.status}`);
const cookie = signIn.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");
if (!cookie) fail("existing QA sign-in issued no session cookie");
console.log("OK   authenticated the existing QA identity");

const invalid = await postVoice(null, cookie, "missing-audio refusal");
assertPrivateNoStore(invalid, "missing-audio refusal");
const invalidBody = await json(invalid);
if (
  invalid.status !== 400
  || typeof invalidBody !== "object"
  || invalidBody === null
  || Array.isArray(invalidBody)
  || Object.keys(invalidBody).length !== 1
  || typeof invalidBody.error !== "string"
) {
  fail(`missing-audio refusal returned ${invalid.status}, expected one private 400 error`);
}
console.log("OK   invalid audio is refused before transcription (400)");

let providerProven = false;
for (let attempt = 1; attempt <= 2; attempt += 1) {
  const entitled = await postVoice(fixture, cookie, "entitled voice transcription");
  assertPrivateNoStore(entitled, "entitled voice transcription");
  if (entitled.status === 402 || entitled.status === 403) {
    fail(`the QA identity is authenticated but is not entitled to voice_always_on (${entitled.status})`);
  }
  if (entitled.status !== 200) {
    fail(`entitled voice transcription returned ${entitled.status}, expected 200`);
  }
  const classification = classifyTrebleTwentyVoiceSuccess(await json(entitled));
  if (classification === "expected") {
    providerProven = true;
    break;
  }
  if (classification === "malformed") {
    fail("the voice route returned a malformed success response");
  }
  if (attempt === 1) {
    console.log("OBS  the first provider sample was structurally valid but unexpected; retrying once");
  }
}
if (!providerProven) fail("two bounded provider samples did not return the expected synthetic T20 command");
console.log("OK   synthetic speech returned T20 with a finite non-zero confidence signal");
console.log(`OK   ${origin} passed the application-data-safe live voice boundary`);
