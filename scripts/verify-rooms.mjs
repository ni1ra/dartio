#!/usr/bin/env node
/*
 * Release gate: is the room boundary actually closed on this deployment?
 *
 * Rooms are `online_multiplayer`, and Free carries zero online seats. That is
 * enforced on the server, so it can be checked from outside without an account that
 * has it — and checking the *refusal* is the part worth automating, because a gate
 * that quietly opens is the failure nobody notices.
 *
 * A full room round trip needs a paid identity and is not attempted here; see
 * docs/CYCLE_14_rooms.md for how that was proven.
 *
 *   node --env-file=.env.local scripts/verify-rooms.mjs https://dartioopus46.vercel.app
 */
const target = process.argv[2] ?? process.env.DARTIO_BASE_URL;
const email = process.env.DARTIO_QA_EMAIL;
const password = process.env.DARTIO_QA_PASSWORD;
if (!target) {
  console.error("usage: node --env-file=.env.local scripts/verify-rooms.mjs <base-url>");
  process.exit(2);
}
const origin = new URL(target).origin;

function fail(message, detail) {
  console.error(`FAIL ${message}`);
  if (detail) console.error(`     ${String(detail).slice(0, 400)}`);
  process.exit(1);
}

async function room(path, init = {}, cookie) {
  return fetch(`${origin}/api/rooms${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}), ...init.headers },
  });
}

// Nothing about a room is visible without a session — watching and reporting a
// finish included. `/complete` was absent from this sweep until Cycle 23; a gate
// that skips a route is a gate that cannot notice it opening.
for (const [label, response] of [
  ["opening a room", await room("", { method: "POST", body: JSON.stringify({ mode: "x01" }) })],
  ["reading a room", await room("/OCHE42")],
  ["watching a room", await room("/OCHE42", { method: "POST", body: JSON.stringify({ spectate: true }) })],
  ["filing a visit", await room("/OCHE42/turns", { method: "POST", body: JSON.stringify({ expectedVersion: 0, seat: 0, turn: {} }) })],
  ["reporting a finish", await room("/OCHE42/complete", { method: "POST", body: JSON.stringify({ winnerSeat: 0 }) })],
]) {
  if (response.status !== 401) fail(`${label} without a session answered ${response.status}, expected 401`);
}
console.log("OK   rooms refuse every request with no session, watching and finishing included (401)");

if (!email || !password) {
  console.log("SKIP no QA identity configured, so the paid boundary was not checked");
  process.exit(0);
}

const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ email, password }),
});
if (!signIn.ok) fail(`sign-in returned ${signIn.status}`, await signIn.text());
const cookie = signIn.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");
console.log("OK   authenticated");

const created = await room("", { method: "POST", body: JSON.stringify({ mode: "x01", options: {} }) }, cookie);
const body = await created.json().catch(() => ({}));
if (created.status === 201) {
  // A paid identity is allowed to get here; say so rather than failing a real Pro run.
  console.log(`OK   this identity has online play and opened room ${body.code}`);
  process.exit(0);
}
if (created.status !== 402 || body.error !== "upgrade_required") {
  fail(`a Free identity got ${created.status} opening a room, expected 402 upgrade_required`, JSON.stringify(body));
}
console.log(`OK   a plan without online play is refused before a room exists (402, required: ${body.required})`);
