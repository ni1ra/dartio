# Cycle 15 — Playing Inside a Room

Status: active

Cycle 14 made rooms real; this makes them playable. Two accounts can now throw at
the same match from different screens, and either of them can close the tab and
come back to it.

## Reconnect was not extra work — it was the same work

The room's record lives on the server as rows, so a client has to turn them back
into a log before it can render anything. `x01LogFromTurns` does that, and it is
the exact inverse of `x01MatchRecord`. Which means **joining a room, reloading the
page, and catching up on an opponent's throw are one code path, not three** — they
are the same question asked at different moments.

`room-log.test.ts` asserts the inverse rather than assuming it: a log survives
being stored and rebuilt, through darts, typed totals, a bust (where the stored
total is the only surviving record of what was claimed), landing points, and rows
arriving in any order. A log that round-trips is a match that survives a reconnect.

## A visit is the unit, not a dart

Visits are filed when they finish, never dart by dart. That is what makes the
writer lock mean anything: a whole visit is the thing two people can collide on,
and a half-thrown visit is nobody's business but the thrower's. It also means an
opponent sees your visit as a visit, the way they would across a real oche.

A conflict is presented as *somebody threw first*, and the room is re-read rather
than the write retried — retrying a write against a version that has moved is how
a client ends up insisting on a turn order nobody else agrees with.

## Two hazards handled deliberately

**One game must not be filed twice.** The room match does not reuse the local match
component. That one owns its own log and files a whole `MatchRecord` to history when
it ends; a room match must not, because the room already *is* that row. Running both
would put one game into history twice — once turn by turn, once as a duplicate —
and into the career statistics computed from it.

**Completing must not increment the version.** `matches.state_version` is also the
turn number: every accepted visit increments it and takes its value. Closing a match
appends no visit, so incrementing there would hand the next turn a number that skips
one. `completeRoomMatch` therefore sets status and winner only, and is idempotent —
both clients replay the same log, both see the same finish, and the second report is
agreement rather than a conflict.

## Scope, split on purpose

Spectators and host handover are not in this cycle. `/friends` still marks them
planned, and now marks rejoin-and-rebuild as live, because that became true.

## Verified receipts — 2026-07-31

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **487 tests across 38 files**, up from 473 across 37. Build green, 25 routes.
- **Fifteen checks against a real preview deployment**, two throwaway identities
  playing each other end to end: room `YT4T54` opened and joined, both seats visible
  to both, a visit filed, a stale write refused with 409 `version_conflict`, a throw
  from the other seat refused with 403 `wrong_seat`, the guest catching up and
  filing, `since=` returning only what followed, a finishing visit filed, the match
  closed, **the guest's report of the same finish answered as agreement rather than
  a conflict**, the room reading `complete` with all three visits, and a late visit
  refused with 409 `room_closed`. Temporary Pro rows removed afterwards.

## Production, and one flake worth naming

The browser suite against production reported 129 passed, 2 skipped, and one
failure: `net::ERR_ADDRESS_UNREACHABLE` navigating to the match page. Every other
test in the same run loaded that same URL successfully, and re-running the spec
gave 12/12. It was a transient name-resolution failure in the local runner, not a
regression — recorded here so the next person reading the log does not go looking
for a product fault that was never there.

`pnpm verify:auth`, `pnpm verify:rooms`, and `pnpm verify:history` all passed
against production, the last of them reporting four stored matches and the deep
statistics correctly withheld from a Free plan.
