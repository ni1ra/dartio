#!/usr/bin/env node
/*
 * Release gate: does a signed-in player's match actually reach Neon and come back?
 *
 * The browser suite exercises free play, so everything behind the login wall is
 * invisible to it — which is how 102/102 once passed against a production
 * deployment nobody could sign in to. `verify:auth` proves an origin is accepted;
 * this proves the authenticated round trip that history, statistics, and rooms all
 * depend on.
 *
 * It signs in, files one match, reads its summary and complete dart-level detail
 * back, and asserts an anonymous request is refused. Preview and production run
 * separate Neon Auth projects, so when sign-in is refused it signs up its own
 * throwaway identity instead — one script, either deployment.
 *
 *   pnpm verify:history https://dartioopus46.vercel.app
 */
import {
  resolveHistoryConfiguration,
  secureHistoryRequestInit,
} from "./verify-history-config.mjs";

const configuration = resolveHistoryConfiguration(process.argv.slice(2), process.env);
if (!configuration.ok) {
  console.error(configuration.message);
  process.exit(2);
}
const { origin, email, password } = configuration;

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isObject(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

// Compare JSON structurally so an API implementation cannot pass by returning
// the right headline fields alongside invented or leaked persistence data.
function isSameJson(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((value, index) => isSameJson(actual[index], value));
  }
  if (isObject(expected)) {
    return hasExactKeys(actual, Object.keys(expected))
      && Object.entries(expected).every(([key, value]) => isSameJson(actual[key], value));
  }
  return Object.is(actual, expected);
}

function hasPrivateNoStore(value) {
  const directives = new Set(
    (value ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase().split("=", 1)[0])
      .filter(Boolean),
  );
  return directives.has("private") && directives.has("no-store");
}

function assertPrivateNoStore(response, label) {
  if (!hasPrivateNoStore(response.headers.get("cache-control"))) {
    fail(`${label} did not return Cache-Control: private, no-store`);
  }
}

async function request(path, init, label) {
  try {
    return await fetch(`${origin}${path}`, secureHistoryRequestInit(init));
  } catch {
    fail(`${label} timed out, redirected, or could not reach the validated deployment`);
  }
}

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch {
    fail(`${label} returned invalid JSON`);
  }
}

function authenticate(path, body) {
  return request(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  }, "authentication");
}

let session = await authenticate("sign-in/email", { email, password });
if (session.status === 401) {
  const probeEmail = `history-probe-${Date.now()}@dartio.test`;
  const signUp = await authenticate("sign-up/email", { email: probeEmail, password, name: "History probe" });
  if (!signUp.ok) fail(`no identity here and sign-up returned ${signUp.status}`);
  console.log(`OK   created a probe identity on this deployment (${probeEmail})`);
  session = signUp;
}
if (!session.ok) fail(`sign-in returned ${session.status}`);

// Better Auth sets more than one cookie, and all of them are sent back.
const cookie = session.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");
if (!cookie) fail("authentication succeeded but issued no cookie");
console.log(`OK   authenticated (${session.status})`);

// Double twenty from forty: the shortest complete match the rules allow.
const record = {
  mode: "x01",
  options: { startingScore: 40, legsToWin: 1, setsToWin: 1, inRule: "straight", outRule: "double" },
  players: [
    { seat: 0, displayName: "Player 1", isBot: false },
    { seat: 1, displayName: "The Navigator", isBot: true, botLevel: 12 },
  ],
  turns: [{
    seat: 0, turnNumber: 1, legNumber: 1, scoreBefore: 40, scoreAfter: 0,
    bust: false, dartsThrown: 1, darts: [{ ordinal: 1, segment: 20, multiplier: 2 }],
  }],
  winnerSeat: 0,
};

const posted = await request("/api/matches", {
  method: "POST",
  headers: { "content-type": "application/json", origin, cookie },
  body: JSON.stringify({ record, ownerSeat: 0 }),
}, "match recording");
if (posted.status !== 201) fail(`recording a match returned ${posted.status}`);
const postedPayload = await responseJson(posted, "match recording");
const id = isObject(postedPayload) ? postedPayload.id : null;
if (typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id)) {
  fail("match recording returned no valid id");
}
console.log("OK   filed one synthetic match");

const history = await request("/api/matches?limit=5", {
  headers: { cookie, origin },
}, "history summary");
if (!history.ok) fail(`reading history returned ${history.status}`);
const historyPayload = await responseJson(history, "history summary");
const matches = isObject(historyPayload) ? historyPayload.matches : null;
if (!Array.isArray(matches)) fail("history summary returned an invalid match list");
const found = matches.find((entry) => isObject(entry) && entry.id === id);
if (!found) fail("the match was recorded but does not appear in history");
console.log("OK   history returned the newly filed match summary");

// A summary proves discoverability; the owner-only detail proves every stored
// dart can be reconstructed without inventing data or exposing another user.
const detailResponse = await request(`/api/matches/${encodeURIComponent(id)}`, {
  headers: { cookie, origin },
}, "match detail");
assertPrivateNoStore(detailResponse, "match detail");
if (detailResponse.status !== 200) {
  fail(`reading the filed match detail returned ${detailResponse.status}`);
}
const detail = await responseJson(detailResponse, "match detail");
if (
  !hasExactKeys(detail, ["match"])
  || !hasExactKeys(detail.match, ["id", "completedAt", "ownerSeat", "record"])
  || detail.match.id !== id
  || detail.match.completedAt !== found.completedAt
  || detail.match.ownerSeat !== 0
  || !isSameJson(detail.match.record, record)
) {
  fail("match detail did not strictly reconstruct the filed match");
}
console.log("OK   owner detail reconstructed the exact X01 roster, visit, D20 checkout, winner, and owner seat");

const statsResponse = await request("/api/stats", {
  headers: { cookie, origin },
}, "statistics");
if (!statsResponse.ok) fail(`reading statistics returned ${statsResponse.status}`);
const stats = await responseJson(statsResponse, "statistics");
if (!isObject(stats) || !(stats.matchesPlayed >= 1)) fail("statistics do not count the match that was just filed");
console.log(`OK   statistics: ${stats.matchesPlayed} match(es), ${stats.matchesWon} won, ${stats.threeDartAverage.toFixed(2)} 3DA`);

// The paid figures are withheld on the server, so a Free payload must not carry
// them at all — hiding them on the client would not be enforcement.
const raw = JSON.stringify(stats);
if (stats.deep === null) {
  if (raw.includes("checkoutPercentage")) fail("a locked payload still carried the paid figures");
  console.log(`OK   deep statistics withheld from this plan, and absent from the payload (history window ${stats.historyLimit})`);
} else {
  console.log(`OK   deep statistics present: checkout ${stats.deep.checkoutPercentage.toFixed(1)}%, best leg ${stats.deep.bestLegDarts ?? "—"}`);
}

// Ownership is the whole claim: without a session there is nothing to see.
for (const path of ["/api/matches", `/api/matches/${encodeURIComponent(id)}`, "/api/stats"]) {
  const anonymous = await request(path, { headers: { origin } }, "anonymous ownership check");
  if (anonymous.status !== 401) fail(`${path} without a session answered ${anonymous.status}, expected 401`);
}
console.log("OK   history, match detail, and statistics all refuse a request with no session (401)");
