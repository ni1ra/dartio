# Cycle 14 — Rooms

Status: active

`rooms` and `room_members` were the last two of the six tables from audit gap 5
with no writer. `/friends` accepted any six-character code, waited 700 ms on a
`setTimeout`, and always answered "that room isn't live" — which looked exactly
like a real lookup failing. A room is now a real row, a seat is a real row, and the
code is what connects them.

## What the server is authoritative over, exactly

Three things, and it is worth being precise because "server-authoritative" is the
kind of phrase that quietly means more than it should:

1. **Membership.** Only a member writes, and only into their own seat.
2. **Ordering.** The turn number is assigned by the server and never sent by a
   client.
3. **Mutual exclusion.** Every write carries the version it believes it is
   extending. `set state_version = state_version + 1 where state_version =
   expected` either matches one row or none, and Postgres decides which under its
   own lock — so two phones cannot both file "turn 14" and overwrite each other.
   Checking first and writing second would leave exactly the gap this closes.

**It is not a referee.** It does not check that a visit was legal, because that
needs the mode's rules, and keeping those off the server is what lets a seventh
mode ship without touching it. Nor could it usefully guess whose turn it is: X01
rotates its leg starter, so "seat = turn number modulo players" is wrong the moment
a leg ends. `/friends` now claims one shared record in one order, and a seat nobody
else can throw from — which is what is true.

The name on a seat comes from the player's own profile, never from the request. It
is shown to everybody else in the room, and a client that could choose it could sit
down as somebody else.

## Scope, adjusted honestly

The queue said cycle 14 would deliver create and join, and cycle 15 reconnect,
handoff, and spectators. Wiring the match screen itself to a room turned out to be
cycle-sized on its own, so it moves to 15 and this cycle ends at the lobby.

That is stated on the page rather than hidden: the lobby says playing inside the
room lands next, and the foundation strip marks reconnect and spectators as
planned. A lobby that quietly never starts a match would be a worse lie than the
`setTimeout` it replaced.

## Details worth keeping

- Room codes come from an alphabet with no O/0 or I/1, because a code is read aloud
  across a room or typed off a screenshot. Collisions retry against the unique index
  on `rooms.code`, which is what makes the retry safe rather than hopeful, and give
  up after five attempts rather than looping.
- A room that has expired and a code that never existed answer identically. A wrong
  code should not reveal that a room was ever there.
- Joining takes the lowest free seat, so a player who leaves and comes back does not
  widen the table.
- The lobby polls every four seconds and **stops after three consecutive failures**
  rather than hammering a dead endpoint, then says the seat is still held.

## Verified receipts — 2026-07-30

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **473 tests across 37 files**, up from 435 across 35. Build green.
- `PRODUCT_AVAILABILITY` had gone stale: `history` and `deepStats` still read
  `coming_soon` after cycles 12 and 13 shipped them, and the access test asserted
  the stale value. Both now read `implemented`; `onlineMultiplayer` stays
  `coming_soon` until a room can be played in, and the map has no word for half a
  feature.
