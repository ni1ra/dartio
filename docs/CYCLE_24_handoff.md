# Cycle 24 — Room Handoff and Lifecycle

Status: active. Opened 2026-08-11 on branch `cycle-24-handoff`.

Second cycle of `PHASE_3_promise_completion.md`. Completes the `/friends` promise
— the room can change hands — and gives rooms the lifecycle they were missing:
an end that isn't a finish, and a death that actually deletes the row.

## What ownership means now

Before this cycle "owner" was a label: written at create, read nowhere,
authorizing nothing. Now it is the authority behind the only two verbs that
belong to one person:

- **Handover** (`POST /api/rooms/[code]/handover`). Host-only. One batch demotes
  the old host's membership, promotes the new one, and moves
  `rooms.owner_user_id` with them, so the row and the memberships can never name
  two hosts. Only a seated human can receive the room; handing it to yourself is
  agreement, not an error. The room cannot be taken — a player or spectator
  asking is refused `not_the_host`.
- **Close** (`POST /api/rooms/[code]/close`). Host-only. Marks the match
  `abandoned` — the first writer that status has ever had — names no winner, and
  leaves `completed_at` null because the match did not complete. Distinct from
  `/complete` on purpose: completion is seat-authorized agreement about a finish
  both players replayed; closing is host authority over a match that never
  finished. Closing twice is agreement. A finished match cannot be un-finished
  into an abandonment.

## Host departure, decided

A room outlives presence by design: closing a tab abandons nothing, the TTL
bounds every room's life, and reconnect is the feature. So departure needs no
event — a leaving host hands over first, or the room simply runs out its clock.
Written down here so the absence of a "leave" endpoint reads as a decision
rather than a gap.

## The sweep

Expired rooms answered as if they never existed but their rows lived forever,
permanently burning codes out of the unique index. `createRoom` now deletes up
to 100 rooms expired more than 24 hours ago before opening a new one: no
scheduler, bounded work, an inherent exit condition. Deletion cascades
memberships; matches survive with `room_id` set null, so history is untouched.
A failed sweep is logged and never blocks the room being opened.

## The flag, retired

`PRODUCT_AVAILABILITY.onlineMultiplayer` is `implemented`. It was held at
`coming_soon` from Cycle 15 deliberately — the map has no word for half a
feature. Create, join, play, reconnect, spectate, handover, and close are all
live, so the word is now simply true. `/friends` carries zero "Planned" chips
and the browser suite asserts that count.

## Queue

- [x] `handOverRoom` and `closeRoom` in `src/lib/server/rooms.ts`, with the
  refusal, idempotency, and atomicity cases in `rooms.test.ts`. Evidence:
  591/591 unit tests this session (was 571; +20).
- [x] Lazy expiry sweep in `createRoom`, bounded and failure-tolerant, with
  tests proving create survives a failed sweep.
- [x] Two new routes with the DI pattern and full route-test blocks, authorize
  before body-read preserved.
- [x] Client verbs `handOverRoom`/`closeRoom`, failure codes `not_the_host` and
  `unknown_seat` wired through to `/friends` copy.
- [x] Lobby host controls: Make host per seat, Close room; closed-room states on
  the lobby and the match surface, inputs withdrawn when the room is closed.
- [x] `verify:rooms:live` is a pnpm script; the no-session sweep in
  `verify:rooms` covers handover and close.
- [x] Flag retired; the stale comment in `friends-room.tsx` rewritten; the one
  access-snapshot test asserting `coming_soon` updated to assert the truth.
- [x] Local gates: typecheck 0, lint 0, test 591/591, build 0, browser 155
  passed / 4 skipped by design — all unpiped this session.
- [x] Preview proof: `verify:rooms:live` against this PR's preview deployment —
  ALL ROOM CHECKS PASSED, 26 OK lines. Room S9J6EU: the room could not be taken
  by player or spectator (403 not_the_host), the host handed it to seat 1 and
  both memberships swapped atomically with the row's owner. Room FK8P2C: only
  its host could close it, closing twice was agreement, and it took no more
  visits. Trusted-domain grant added (201) and removed (200). 2026-08-11.
- [ ] Production verified after merge: verify gates plus the rooms browser spec
  against the live deployment.

## Found for later, not fixed here

Neither `queryMatches` nor `readStatMatches` filters on `matches.status`, and
`order by completed_at desc` is NULLS FIRST in Postgres — an active or abandoned
room match surfaces in history and sorts to the top. Queued into Cycle 28, which
owns that data layer, alongside the missing `completed_at` index.

## Receipts

- 2026-08-11 · `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 591/591 across 44
  files, `pnpm build` 0, `pnpm test:browser` 155 passed / 4 skipped by design —
  all unpiped, exit codes read, this session.
