# Cycle 23 — Room Spectators

Status: closed 2026-08-11 on production evidence. Opened 2026-08-11 on branch
`cycle-23-spectators`; merged as PR #26, `b51a879`.

The first cycle of `PHASE_3_promise_completion.md`. `/friends` has carried
"Planned · spectators and host handover" since Cycle 15 split both out of room
play. This cycle delivers the first half and leaves the chip honest about the
second.

## What a spectator is

A membership row and nothing else. The `room_member_role` enum has carried
`spectator` since migration 0000 — the schema anticipated this cycle; no
migration was needed. A spectator has no `players` row, and that absence is the
design:

- **No seat, no write.** `appendRoomTurn` and `completeRoomMatch` authorize by
  seat; a spectator fails that check structurally, before any version
  arithmetic. The refusal is its own code, `spectator_read_only`, because
  telling a member "you are not in this room" would be false.
- **No seat, no statistics.** Match history and career stats join from
  `players`. A spectator can never appear in either, not because a filter
  excludes them but because there is no row to include.
- **Same rebuild path.** A watcher's screen replays the server's own visits
  through `x01LogFromTurns` exactly as a player's does. Watching, joining,
  reloading, and catching up are one code path.

## Decisions

- **Watching costs `online_multiplayer`.** Free carries zero online seats and a
  gallery chair is an online seat. Fail-closed and consistent with create/join;
  flipping it later is policy, not architecture.
- **Counted, not named.** `room_members` carries no display name and the players'
  names are on the seats. The room reports `watching: n`; a gallery is company,
  not a roster. Naming watchers would need a column — deliberately not taken.
- **A seat outranks the gallery.** A player asking to watch keeps their seat and
  is told what they are. The room demotes nobody.
- **A spectator taking a seat is promoted** — the membership row updates
  `spectator → player`, guarded so it can never rewrite an `owner`. Inserting
  would trip the composite primary key and misread as a seat race.
- **Gallery capped at 16** (`MAX_SPECTATORS`), refused as `gallery_full`. A cap
  is what keeps one room from accreting unbounded membership rows; the number is
  generous because the cap is a bound, not a product decision.
- **Read schemas stopped being `.strict()`** in `rooms-client.ts`. The server
  grew two additive fields (`watching`, `yourRole`) and a deployed bundle
  strict-parsing a response it mostly understands would have refused the whole
  room over keys it could ignore. Unknown keys are now stripped: reads tolerate
  server growth. The one-deploy window where an old bundle strict-fails the new
  response is accepted and bounded — rooms live 12 hours and the fix is a reload.

## Queue

- [x] `spectateRoom` in `src/lib/server/rooms.ts`: membership row, idempotent
  re-entry, racing-tap unique-violation tolerance, closed-room and full-gallery
  refusals. Evidence: 10 new cases in `rooms.test.ts`, 571/571 unit tests green
  this session.
- [x] `findRoom` carries `members` via a scalar subquery — two joined aggregates
  would multiply rows. Evidence: same suite.
- [x] Honest write refusals: `spectator_read_only` from turns and complete, with
  the fake-database tests proving the refusal precedes version arithmetic.
- [x] `POST /api/rooms/[code]` accepts `{ spectate: true }`, authorize before
  body-read preserved; absent and empty bodies still mean "seat me" for deployed
  clients. Evidence: 14 new route tests including the previously untested
  `/complete` handler block.
- [x] `readRoom` reports `watching` and `yourRole`; seats stay the players'.
- [x] Client: `spectateRoom()`, two new failure codes, read schemas tolerant of
  additive server fields.
- [x] `/friends`: "Watch instead" beside Join, gallery count in the lobby,
  watcher standing named, chips split — spectators Live, handover Planned.
  Evidence: `rooms.spec.ts` sharpened to assert the split and exactly one
  remaining Planned chip.
- [x] Room match surface: WATCHING header, whose-throw status for watchers,
  gallery count for players, input pad withheld from watchers while the board
  stays as the display, no completion reporting from a chair.
- [x] Local browser suite green at all three viewports. Evidence: 155 passed,
  4 skipped by design, exit 0, unpiped, this session.
- [x] Preview proof: extended `verify-rooms-live.mjs` — third identity pulled up
  a chair in room H4PN58, was counted (`watching: 1`, `yourSeat: null`,
  `yourRole: spectator`), was refused a visit and the finish as
  `spectator_read_only` with the visit refusal proven to precede version
  arithmetic, and saw the finished match with all three visits. Evidence below,
  2026-08-11.
- [x] Production verified after merge: `verify:auth` OK, `verify:history` OK
  (match filed and read back, deep stats withheld from Free), `verify:rooms` OK
  with the no-session sweep now covering watch and complete, and the rooms
  browser spec 9/9 at all three viewports — all against
  `https://dartioopus46.vercel.app` after merge `b51a879`, exit codes 0,
  2026-08-11.

## Receipts

Recorded as they land; nothing above flips without one.

- 2026-08-11 · `pnpm typecheck` exit 0, `pnpm lint` exit 0 (`--max-warnings=0`),
  `pnpm test` 571/571 across 44 files (was 547 at phase close; +24 from this
  cycle), all run unpiped in this session.
- 2026-08-11 · `pnpm build` exit 0. `pnpm test:browser` 155 passed, 4 skipped by
  design, exit 0, at 390×844 / 834×1112 / 1440×1000 against the local build.
- 2026-08-11 · `verify-rooms-live.mjs` against the PR's preview deployment:
  ALL ROOM CHECKS PASSED — 22 OK lines including the five spectator checks, three
  throwaway identities granted and removed, room H4PN58. The preview origin was
  added to the preview branch's Neon Auth trusted domains for the run (HTTP 201)
  and removed after it (HTTP 200), the Cycle 11 dance.
