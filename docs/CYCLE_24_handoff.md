# Cycle 24 — Room Handoff and Lifecycle

Status: active. Opened 2026-08-11. The first candidate merged as PR #27
(`924d22b`); the corrective slice is on `cycle-24-lifecycle-fix`. PR #27's
production receipts are retained below, but they do not close the corrected
implementation.

Second cycle of `PHASE_3_promise_completion.md`. Completes the `/friends`
promise — the room can change hands — and gives every room mutation one terminal
lifecycle: after close or completion, no stale join, watcher, visit, handover, or
finish can reopen or rewrite it.

## What ownership and terminal state mean

Before this cycle "owner" was a label: written at create, read nowhere,
authorizing nothing. It is now canonical authority in `rooms.owner_user_id`,
mirrored by exactly one owner membership for display.

- **Handover** (`POST /api/rooms/[code]/handover`) is host-only. One
  data-modifying statement locks the room and match, rechecks canonical authority
  and the open status, moves `rooms.owner_user_id`, demotes the old membership,
  and promotes the new one. Competing gifts from a stale host therefore serialize
  to one owner rather than creating two.
- **Close** (`POST /api/rooms/[code]/close`) is host-only and marks the match
  `abandoned`, without a winner or `completed_at`. Close and completion contend
  on the same match row; one terminal transition wins and the other observes
  `room_closed`. Closing an abandoned room twice is agreement. A completed match
  cannot be un-finished into abandonment.
- **Every other mutation participates.** Join and spectator admission take the
  same room/match locks before changing membership or status. A visit claims the
  version and inserts its turn and darts in one Postgres statement, so neither a
  close race nor a failed insert can leave `state_version` without the matching
  turn. Completion changes only an open match. Terminal state is monotonic.

## Host departure and expiry, decided

A room outlives presence by design: closing a tab abandons nothing, reconnect is
the feature, and the twelve-hour TTL makes an expired room indistinguishable from
a code that never existed. A leaving host hands over first, or the room runs out
its clock. There is deliberately no unreliable tab-close event.

The first candidate added a lazy physical purge to `createRoom`. That purge is
removed: it deleted real room and membership rows as a side effect of opening a
room, without a snapshot or restore path, while this campaign explicitly forbids
destructive database operations. Expired rows remain unreachable. Physical
archive/purge is parked until separately authorized with a recoverable design;
Cycle 24 does not claim it shipped.

This was a confirmed hard-stop breach, not merely dormant code. A read-only
Preview audit after removal found zero anomalies among surviving rooms, but found
2 pending/active matches and 3 multi-user matches whose `room_id` is now null.
The latter shape cannot be produced by local match filing, so at least three old
Preview room rows were physically purged and their memberships cascaded while
the candidate was exercised. No repair or further deletion was attempted. The
same count-only Production audit found zero orphan signatures and zero
surviving-room anomalies. Available evidence therefore confines confirmed purge
impact to Preview, though absence of a pre-purge snapshot means current counts
cannot prove every historical side effect that left no signature.

## History remains about filed matches

Room rows exist from creation, including active and host-abandoned matches whose
`completed_at` is null. Both history and statistics now require a non-null
`completed_at`, so those lifecycle rows never appear at the top as 1970 entries
or change a player's numbers. Locally filed abandoned matches still carry a
completion timestamp and retain their existing history semantics.

## The flag, retired

`PRODUCT_AVAILABILITY.onlineMultiplayer` is `implemented`. Create, join, play,
reconnect, spectate, handover, and close are all live, so `/friends` carries zero
"Planned" chips and the browser suite asserts that count.

## Queue

- [x] Host-only handover and close routes, client verbs, refusal codes, and lobby
  controls from the first candidate.
- [x] Canonical, serialized handover; terminal close/complete arbitration; atomic
  visit append; and locked join/spectator admission. Focused evidence this session:
  `rooms.test.ts` and `match-history.test.ts`, 61/61; `pnpm typecheck`, exit 0.
- [x] Closed state withdraws match inputs and no longer reports a finish; host
  controls disable while a mutation is in flight; the fourth seat-list action has
  deliberate desktop and narrow layout rules. Canonical close also wins the UI
  when the stored visits already replay to a finish: no active seat, completion
  label, or scoring pad survives.
- [x] History and statistics exclude rows with null `completed_at`, with rendered
  SQL assertions in `match-history.test.ts`.
- [x] Read-only integrity probe reports owner, version/turn, terminal-field, and
  historical orphan-signature counts without row ids or account data. Preview:
  live anomalies all 0; historical signatures open=2, multi-user=3.
- [x] `verify:rooms:live` expanded to exercise the lifecycle SQL once deployed:
  competing handovers, canonical owner agreement, close versus completion,
  post-close refusal, and history/statistics exclusion. Its package entrypoint
  now reads `DATABASE_URL` directly from ignored `.env.local`, validates the
  exact Preview pooler, and rejects a positional database argument. The package
  entrypoint contains no credential; callers must not add one because `pnpm`
  echoes arguments before script code runs.
- [x] Full local gates on the corrective branch: typecheck 0, lint 0, test
  616/616, build 0, browser 161 passed / 4 skipped by design; all unpiped.
- [ ] Fresh Preview deployment and rerun through the remediated credential-safe
  `verify:rooms:live` entrypoint. PR #27's Preview proof and the pre-rotation
  corrective run cannot cover this final revision.
- [ ] Corrective PR CI green, merged, then all three production verify gates and
  touched browser surfaces green against `https://dartioopus46.vercel.app`.
- [ ] Physical expiry archive/purge — parked because the active goal forbids
  destructive database operations; no automatic `DELETE` remains.

## Superseded-candidate receipts retained for audit

- 2026-08-11 · PR #27 candidate: typecheck 0, lint 0, test 591/591 across 44
  files, build 0, browser 155 passed / 4 skipped by design.
- 2026-08-11 · PR #27 Preview: `verify:rooms:live` reported all checks passed
  with 26 OK lines after the trusted-domain grant was added and removed.
- 2026-08-11 · PR #27 merged as `924d22b`; production auth, history, rooms, and
  rooms-browser probes exited 0. These receipts prove that deployed candidate,
  not the later lifecycle correction.
- 2026-08-11 · Post-merge main CI run `31439841596` failed while fetching the
  external Manrope font and resolving Turbopack's internal Google-font module.
  PR #27's build had passed minutes earlier. The same failure reproduced while
  starting the corrective browser proof, so this was a release blocker rather
  than a harmless transient.

## Corrective receipts

- 2026-08-11 · `node --check scripts/verify-rooms-live.mjs`, exit 0;
  `node --check scripts/verify-room-integrity.mjs`, exit 0;
  `pnpm typecheck`, exit 0; focused Vitest run, 61/61 across two files, exit 0.
- 2026-08-11 · Read-only Preview integrity audit: owner=0, version=0,
  abandoned_fields=0, complete_fields=0, open_fields=0; historical orphan
  signatures open=2, multi_user=3; exit 0. Counts only; no ids or secrets printed.
- 2026-08-11 · Read-only Production integrity audit through a refreshed Neon
  control-plane URI: owner=0, version=0, all terminal-field counts=0; historical
  orphan signatures open=0, multi_user=0; exit 0. URI, ids, and secrets were not
  printed.
- 2026-08-11 · Google-backed `next/font` was replaced by pinned Fontsource 5.3.0
  packages for the same Manrope, Syne, and DM Mono families. The final standalone
  `pnpm build` compiled in 8.9 seconds, exit 0, without a Google request.
- 2026-08-11 · Final corrective local gates: `pnpm typecheck` 0, `pnpm lint` 0,
  `pnpm test` 616/616 across 45 files, `pnpm build` 0; all unpiped. The
  credential boundary's pure no-write matrix passed 16/16, including ambient
  override immunity, generic malformed-input refusals, exact Preview database
  shape, and both Production aliases across HTTP, HTTPS, and DNS-root-dot
  variants. The authenticated room matrix passed 15/15 in 141.7 seconds at all
  three viewports, including a close-after-finishing-visit state. The final full
  browser matrix passed 161 with 4 design skips across 165 cases in 200.9
  seconds, exit 0.
- 2026-08-11 · The first corrective Preview live run passed, but its invocation
  supplied the Preview database URI as a `pnpm` argument and `pnpm` echoed the
  expanded command. Release stopped before merge. The branch-local Neon role was
  reset once; its returned operation finished; Vercel's all-Preview
  `DATABASE_URL` was replaced and marked `sensitive`; and the ignored local
  value was replaced without pulling or overwriting the QA variables. The
  control-plane URI and local value then matched exactly. A read-only audit
  through the replacement credential exited 0 with every surviving-room anomaly
  count at zero and the known historical Preview signatures unchanged at
  open=2, multi_user=3. No Production credential or environment variable was
  targeted. The live verifier no longer accepts the secret-bearing invocation,
  ignores ambient database overrides, and refuses a database outside the named
  Preview branch before constructing its SQL client.
