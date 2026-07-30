#!/usr/bin/env node
/*
 * Full room round trip: two identities, one room, a deliberate collision.
 *
 * PREVIEW ONLY, AND IT WRITES. Rooms need `online_multiplayer`, which no QA
 * identity has, so this grants a temporary Pro row to two throwaway sign-ups,
 * plays them against each other, and deletes the rows afterwards. It refuses to
 * run against production, because a gate that fabricates billing state must never
 * be pointed at real billing state.
 *
 * This exists because it earned its place: the room write was a Postgres syntax
 * error that every unit test passed straight through, since a fake database never
 * renders SQL. Only two real clients on a real deployment could see it.
 *
 *   node scripts/verify-rooms-live.mjs <preview-url> <preview-database-url>
 */

import { neon } from "@neondatabase/serverless";

const [target, databaseUrl] = process.argv.slice(2);
if (!target || !databaseUrl) {
  console.error("usage: node scripts/verify-rooms-live.mjs <preview-url> <preview-database-url>");
  process.exit(2);
}
const origin = new URL(target).origin;
// Named explicitly rather than inferred: "does not look like production" is not a
// safety property, and this script grants subscriptions.
if (/dartioopus46\.vercel\.app|^https:\/\/dartio\.vercel\.app/.test(origin)) {
  console.error("REFUSED this script grants temporary Pro rows and must never run against production");
  process.exit(2);
}
const sql = neon(databaseUrl);
const granted = [];

function fail(message, detail) {
  console.error(`FAIL ${message}`);
  if (detail) console.error(`     ${String(detail).slice(0, 500)}`);
  return cleanup().then(() => process.exit(1));
}

async function cleanup() {
  for (const userId of granted) {
    await sql`delete from subscriptions where user_id = ${userId}`;
  }
  if (granted.length) console.log(`OK   removed ${granted.length} temporary Pro row(s) from preview`);
}

/** Signs up a throwaway identity and returns its cookie jar and user id. */
async function identity(label) {
  const email = `rooms-probe-${label}-${Date.now()}@dartio.test`;
  const response = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password: "probe-password-1234", name: `Probe ${label}` }),
  });
  if (!response.ok) await fail(`sign-up for ${label} returned ${response.status}`, await response.text());
  const cookie = response.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");

  // The user row is created lazily on the first authenticated Dartio request.
  await fetch(`${origin}/api/access`, { headers: { cookie, origin } });
  const rows = await sql`select id from users where email = ${email.toLowerCase()}`;
  if (!rows[0]) await fail(`no Dartio user row for ${email}`);
  const userId = rows[0].id;

  await sql`
    insert into subscriptions (user_id, stripe_customer_id, plan, status, current_period_end)
    values (${userId}, ${`cus_probe_${userId.slice(0, 8)}`}, 'pro', 'active', now() + interval '30 days')
    on conflict (user_id) do update set plan = 'pro', status = 'active'`;
  granted.push(userId);
  console.log(`OK   ${label} signed up and granted a temporary preview Pro row`);
  return { cookie, email };
}

async function api(path, cookie, init = {}) {
  const response = await fetch(`${origin}/api/rooms${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin, cookie, ...init.headers },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const host = await identity("host");
const guest = await identity("guest");

const created = await api("", host.cookie, { method: "POST", body: JSON.stringify({ mode: "x01", options: { startingScore: 501 } }) });
if (created.status !== 201) await fail(`opening a room returned ${created.status}`, JSON.stringify(created.body));
const code = created.body.code;
console.log(`OK   host opened room ${code} in seat ${created.body.seat}`);

const joined = await api(`/${code}`, guest.cookie, { method: "POST", body: "{}" });
if (joined.status !== 200 || joined.body.seat !== 1) await fail(`joining returned ${joined.status}`, JSON.stringify(joined.body));
console.log(`OK   guest joined the same room into seat ${joined.body.seat}`);

const seen = await api(`/${code}?since=0`, guest.cookie);
if (seen.status !== 200) await fail(`reading the room returned ${seen.status}`, JSON.stringify(seen.body));
if (seen.body.seats.length !== 2) await fail("the room does not show both players", JSON.stringify(seen.body.seats));
console.log(`OK   both seats visible, room at version ${seen.body.version}, guest sees yourSeat=${seen.body.yourSeat}`);

const visit = (expectedVersion, seat) => ({
  method: "POST",
  body: JSON.stringify({
    expectedVersion,
    seat,
    turn: {
      legNumber: 1, scoreBefore: 501, scoreAfter: 441, bust: false, dartsThrown: 3,
      darts: [1, 2, 3].map((ordinal) => ({ ordinal, segment: 20, multiplier: 1 })),
    },
  }),
});

const first = await api(`/${code}/turns`, host.cookie, visit(0, 0));
if (first.status !== 201) await fail(`filing the first visit returned ${first.status}`, JSON.stringify(first.body));
console.log(`OK   host filed a visit, room now at version ${first.body.version}`);

// The whole point: a second writer holding the stale version is refused.
const conflicting = await api(`/${code}/turns`, guest.cookie, visit(0, 1));
if (conflicting.status !== 409 || conflicting.body.error !== "version_conflict") {
  await fail(`a stale write returned ${conflicting.status}, expected 409 version_conflict`, JSON.stringify(conflicting.body));
}
console.log("OK   a visit filed against a stale version is refused (409 version_conflict)");

const wrongSeat = await api(`/${code}/turns`, guest.cookie, visit(1, 0));
if (wrongSeat.status !== 403 || wrongSeat.body.error !== "wrong_seat") {
  await fail(`throwing from another seat returned ${wrongSeat.status}, expected 403 wrong_seat`, JSON.stringify(wrongSeat.body));
}
console.log("OK   throwing from somebody else's seat is refused (403 wrong_seat)");

const second = await api(`/${code}/turns`, guest.cookie, visit(1, 1));
if (second.status !== 201) await fail(`the guest's own visit returned ${second.status}`, JSON.stringify(second.body));
console.log(`OK   guest filed their own visit after catching up, room at version ${second.body.version}`);

const final = await api(`/${code}?since=1`, host.cookie);
if (final.body.turns.length !== 1 || final.body.turns[0].turnNumber !== 2) {
  await fail("reading since version 1 did not return exactly the visit after it", JSON.stringify(final.body.turns));
}
console.log("OK   reading since a version returns only what arrived after it");

await cleanup();
console.log("\nALL ROOM CHECKS PASSED");
