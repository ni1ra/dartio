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
 * It signs in, files one match, reads history back, asserts the match it just filed
 * is in there, and asserts an anonymous request is refused. Preview and production
 * run separate Neon Auth projects, so when sign-in is refused it signs up its own
 * throwaway identity instead — one script, either deployment.
 *
 *   node --env-file=.env.local scripts/verify-history.mjs https://dartioopus46.vercel.app
 */
const target = process.argv[2] ?? process.env.DARTIO_BASE_URL;
const email = process.env.DARTIO_QA_EMAIL;
const password = process.env.DARTIO_QA_PASSWORD;
if (!target || !email || !password) {
  console.error("usage: node --env-file=.env.local scripts/verify-history.mjs <base-url>");
  console.error("       requires DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD");
  process.exit(2);
}
const origin = new URL(target).origin;

function fail(message, detail) {
  console.error(`FAIL ${message}`);
  if (detail) console.error(`     ${String(detail).slice(0, 500)}`);
  process.exit(1);
}

function authenticate(path, body) {
  return fetch(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

let session = await authenticate("sign-in/email", { email, password });
if (session.status === 401) {
  const probeEmail = `history-probe-${Date.now()}@dartio.test`;
  const signUp = await authenticate("sign-up/email", { email: probeEmail, password, name: "History probe" });
  if (!signUp.ok) fail(`no identity here and sign-up returned ${signUp.status}`, await signUp.text());
  console.log(`OK   created a probe identity on this deployment (${probeEmail})`);
  session = signUp;
}
if (!session.ok) fail(`sign-in returned ${session.status}`, await session.text());

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

const posted = await fetch(`${origin}/api/matches`, {
  method: "POST",
  headers: { "content-type": "application/json", origin, cookie },
  body: JSON.stringify({ record, ownerSeat: 0 }),
});
const postedBody = await posted.text();
if (posted.status !== 201) fail(`recording a match returned ${posted.status}`, postedBody);
const { id } = JSON.parse(postedBody);
console.log(`OK   filed match ${id}`);

const history = await fetch(`${origin}/api/matches?limit=5`, { headers: { cookie, origin } });
if (!history.ok) fail(`reading history returned ${history.status}`, await history.text());
const { matches } = await history.json();
const found = matches.find((entry) => entry.id === id);
if (!found) fail("the match was recorded but does not appear in history", JSON.stringify(matches).slice(0, 300));
console.log(`OK   history returned it: ${found.mode}, ${found.turnCount} visit(s), ${found.dartCount} dart(s), winner seat ${found.winnerSeat}`);
console.log(`OK   roster: ${found.players.map((p) => `${p.displayName}${p.isYou ? " (you)" : ""}${p.isBot ? ` [bot ${p.botLevel}]` : ""}`).join(" vs ")}`);

const statsResponse = await fetch(`${origin}/api/stats`, { headers: { cookie, origin } });
if (!statsResponse.ok) fail(`reading statistics returned ${statsResponse.status}`, await statsResponse.text());
const stats = await statsResponse.json();
if (!(stats.matchesPlayed >= 1)) fail("statistics do not count the match that was just filed", JSON.stringify(stats));
console.log(`OK   statistics: ${stats.matchesPlayed} match(es), ${stats.matchesWon} won, ${stats.threeDartAverage.toFixed(2)} 3DA`);

// The paid figures are withheld on the server, so a Free payload must not carry
// them at all — hiding them on the client would not be enforcement.
const raw = JSON.stringify(stats);
if (stats.deep === null) {
  if (raw.includes("checkoutPercentage")) fail("a locked payload still carried the paid figures", raw.slice(0, 300));
  console.log(`OK   deep statistics withheld from this plan, and absent from the payload (history window ${stats.historyLimit})`);
} else {
  console.log(`OK   deep statistics present: checkout ${stats.deep.checkoutPercentage.toFixed(1)}%, best leg ${stats.deep.bestLegDarts ?? "—"}`);
}

// Ownership is the whole claim: without a session there is nothing to see.
for (const path of ["/api/matches", "/api/stats"]) {
  const anonymous = await fetch(`${origin}${path}`, { headers: { origin } });
  if (anonymous.status !== 401) fail(`${path} without a session answered ${anonymous.status}, expected 401`);
}
console.log("OK   history and statistics both refuse a request with no session (401)");
