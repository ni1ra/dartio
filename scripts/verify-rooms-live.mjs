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
const watcher = await identity("watcher");

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

// A third account pulls up a chair. No seat is taken and the players see the count.
const chair = await api(`/${code}`, watcher.cookie, { method: "POST", body: JSON.stringify({ spectate: true }) });
if (chair.status !== 200 || chair.body.role !== "spectator") {
  await fail(`spectating returned ${chair.status}`, JSON.stringify(chair.body));
}
console.log(`OK   watcher pulled up a chair as ${chair.body.role}`);

const chairAgain = await api(`/${code}`, watcher.cookie, { method: "POST", body: JSON.stringify({ spectate: true }) });
if (chairAgain.status !== 200 || chairAgain.body.role !== "spectator") {
  await fail(`spectating twice returned ${chairAgain.status}, expected the same chair`, JSON.stringify(chairAgain.body));
}
console.log("OK   asking to watch twice is the same chair, not an error");

const watcherView = await api(`/${code}?since=0`, watcher.cookie);
if (watcherView.body.yourSeat !== null || watcherView.body.yourRole !== "spectator") {
  await fail("the watcher does not read as a seatless spectator", JSON.stringify({ yourSeat: watcherView.body.yourSeat, yourRole: watcherView.body.yourRole }));
}
if (watcherView.body.watching !== 1 || watcherView.body.seats.length !== 2) {
  await fail("the room does not count exactly one watcher over two seats", JSON.stringify({ watching: watcherView.body.watching, seats: watcherView.body.seats.length }));
}
console.log("OK   the watcher reads the room seatless, and the room counts one watching");

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

// The chair confers no arm. A stale version AND a stolen seat AND no membership
// seat: the spectator refusal must win, proving it precedes the version arithmetic.
const watcherThrow = await api(`/${code}/turns`, watcher.cookie, visit(0, 0));
if (watcherThrow.status !== 403 || watcherThrow.body.error !== "spectator_read_only") {
  await fail(`a spectator's visit returned ${watcherThrow.status}, expected 403 spectator_read_only`, JSON.stringify(watcherThrow.body));
}
console.log("OK   a spectator's visit is refused as read-only, before any version check (403 spectator_read_only)");

// The room changes hands mid-match. Only the host can hand it over, and the
// transfer moves the label and the row's owner together.
const guestGrab = await api(`/${code}/handover`, guest.cookie, { method: "POST", body: JSON.stringify({ toSeat: 1 }) });
if (guestGrab.status !== 403 || guestGrab.body.error !== "not_the_host") {
  await fail(`a player taking the room returned ${guestGrab.status}, expected 403 not_the_host`, JSON.stringify(guestGrab.body));
}
const watcherGrab = await api(`/${code}/handover`, watcher.cookie, { method: "POST", body: JSON.stringify({ toSeat: 1 }) });
if (watcherGrab.status !== 403 || watcherGrab.body.error !== "not_the_host") {
  await fail(`a spectator taking the room returned ${watcherGrab.status}, expected 403 not_the_host`, JSON.stringify(watcherGrab.body));
}
console.log("OK   the room cannot be taken, only given (403 not_the_host for player and spectator)");

const handed = await api(`/${code}/handover`, host.cookie, { method: "POST", body: JSON.stringify({ toSeat: 1 }) });
if (handed.status !== 200 || handed.body.hostSeat !== 1) {
  await fail(`handing the room over returned ${handed.status}`, JSON.stringify(handed.body));
}
const rolesAfter = await api(`/${code}?since=0`, guest.cookie);
const seatRoles = rolesAfter.body.seats.map((seat) => seat.role).join(",");
if (rolesAfter.body.yourRole !== "owner" || seatRoles !== "player,owner") {
  await fail("the handover did not swap the roles", JSON.stringify({ yourRole: rolesAfter.body.yourRole, seatRoles }));
}
console.log("OK   host handed the room to seat 1, and both memberships swapped atomically");

const second = await api(`/${code}/turns`, guest.cookie, visit(1, 1));
if (second.status !== 201) await fail(`the guest's own visit returned ${second.status}`, JSON.stringify(second.body));
console.log(`OK   guest filed their own visit after catching up, room at version ${second.body.version}`);

const final = await api(`/${code}?since=1`, host.cookie);
if (final.body.turns.length !== 1 || final.body.turns[0].turnNumber !== 2) {
  await fail("reading since version 1 did not return exactly the visit after it", JSON.stringify(final.body.turns));
}
console.log("OK   reading since a version returns only what arrived after it");

// A visit that takes a player out, then the finish reported the way both clients
// report it. The server never judges the visit; it records it and closes the room.
const finishing = await api(`/${code}/turns`, host.cookie, {
  method: "POST",
  body: JSON.stringify({
    expectedVersion: 2,
    seat: 0,
    turn: {
      legNumber: 1, scoreBefore: 40, scoreAfter: 0, bust: false, dartsThrown: 1,
      darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
    },
  }),
});
if (finishing.status !== 201) await fail(`the finishing visit returned ${finishing.status}`, JSON.stringify(finishing.body));
console.log(`OK   host filed a finishing visit, room at version ${finishing.body.version}`);

const watcherClose = await api(`/${code}/complete`, watcher.cookie, { method: "POST", body: JSON.stringify({ winnerSeat: 0 }) });
if (watcherClose.status !== 403 || watcherClose.body.error !== "spectator_read_only") {
  await fail(`a spectator closing the match returned ${watcherClose.status}, expected 403 spectator_read_only`, JSON.stringify(watcherClose.body));
}
console.log("OK   a spectator cannot report the finish (403 spectator_read_only)");

const closed = await api(`/${code}/complete`, host.cookie, { method: "POST", body: JSON.stringify({ winnerSeat: 0 }) });
if (closed.status !== 200 || closed.body.alreadyComplete !== false) {
  await fail(`closing the match returned ${closed.status}`, JSON.stringify(closed.body));
}
console.log("OK   host closed the match");

// The other client reports the same finish; agreement, not a conflict.
const echoed = await api(`/${code}/complete`, guest.cookie, { method: "POST", body: JSON.stringify({ winnerSeat: 0 }) });
if (echoed.status !== 200 || echoed.body.alreadyComplete !== true) {
  await fail(`the second report of the same finish returned ${echoed.status}`, JSON.stringify(echoed.body));
}
console.log("OK   the guest reporting the same finish is agreement, not a conflict");

const after = await api(`/${code}?since=0`, guest.cookie);
if (after.body.status !== "complete") await fail(`the room reads ${after.body.status}, expected complete`);
if (after.body.turns.length !== 3) await fail(`the room holds ${after.body.turns.length} visits, expected 3`);
console.log(`OK   the room reads complete and holds all ${after.body.turns.length} visits`);

// The gallery outlives the finish: a watcher already in the room still sees the result.
const watcherAfter = await api(`/${code}?since=0`, watcher.cookie);
if (watcherAfter.body.status !== "complete" || watcherAfter.body.turns.length !== 3) {
  await fail("the watcher cannot see the finished match", JSON.stringify({ status: watcherAfter.body.status, turns: watcherAfter.body.turns.length }));
}
console.log("OK   the watcher sees the finished match and every visit in it");

// A closed room takes no more darts.
const late = await api(`/${code}/turns`, guest.cookie, visit(3, 1));
if (late.status !== 409 || late.body.error !== "room_closed") {
  await fail(`a visit filed after the finish returned ${late.status}, expected 409 room_closed`, JSON.stringify(late.body));
}
console.log("OK   a finished room takes no more visits (409 room_closed)");

// A second room proves the host's other verb: closing without a finish.
const second_room = await api("", guest.cookie, { method: "POST", body: JSON.stringify({ mode: "x01", options: { startingScore: 301 } }) });
if (second_room.status !== 201) await fail(`opening the second room returned ${second_room.status}`, JSON.stringify(second_room.body));
const code2 = second_room.body.code;

const strangerClose = await api(`/${code2}/close`, host.cookie, { method: "POST", body: "{}" });
if (strangerClose.status !== 403 || strangerClose.body.error !== "not_the_host") {
  await fail(`a non-host closing the room returned ${strangerClose.status}, expected 403 not_the_host`, JSON.stringify(strangerClose.body));
}
const closedRoom = await api(`/${code2}/close`, guest.cookie, { method: "POST", body: "{}" });
if (closedRoom.status !== 200 || closedRoom.body.alreadyClosed !== false) {
  await fail(`the host closing the room returned ${closedRoom.status}`, JSON.stringify(closedRoom.body));
}
const closedAgain = await api(`/${code2}/close`, guest.cookie, { method: "POST", body: "{}" });
if (closedAgain.status !== 200 || closedAgain.body.alreadyClosed !== true) {
  await fail(`closing twice returned ${closedAgain.status}, expected agreement`, JSON.stringify(closedAgain.body));
}
const closedVisit = await api(`/${code2}/turns`, guest.cookie, visit(0, 0));
if (closedVisit.status !== 409 || closedVisit.body.error !== "room_closed") {
  await fail(`a visit into a closed room returned ${closedVisit.status}, expected 409 room_closed`, JSON.stringify(closedVisit.body));
}
const closedState = await api(`/${code2}?since=0`, guest.cookie);
if (closedState.body.status !== "abandoned") {
  await fail(`the closed room reads ${closedState.body.status}, expected abandoned`);
}
console.log(`OK   room ${code2}: only its host could close it, closing twice is agreement, and it takes no more visits`);

await cleanup();
console.log("\nALL ROOM CHECKS PASSED");
