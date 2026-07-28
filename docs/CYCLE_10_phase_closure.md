# Cycle 10 — Phase Closure

Status: active

Closes the eight-cycle run that began with `artifacts/GAP_AUDIT_2026-07-28.md`.

## What the phase set out to do

Revamp the interface, implement the remaining work, and audit the product for
gaps and fill them. Eight cycles, numbered 3 through 10 to continue the repo's
own history.

## The audit, re-scored against the code that now exists

Sixteen gaps were written down at the start. Each is re-scored here against the
current `main`, verified by the browser suite running against the live
production deployment rather than against a local build.

| # | Gap | Now |
|---|---|---|
| 1 | The match does not fit a phone | **Closed** — Cycle 4. The pad starts at y=732 on an 844 px screen; a visit is scorable without scrolling |
| 2 | The segmented control has no visible selected state | **Closed** — Cycle 4. One unlayered third-party reset had been flattening every Navi component in the product |
| 3 | Eight of nine catalog rows are not games | **Partly** — six of nine are playable: X01, Cricket, Around the Clock, Shanghai, Count-Up, Bob's 27. The three practice drills remain |
| 4 | A match cannot survive a reload | **Closed** — Cycle 5, and inherited by every mode added since |
| 5 | Six tables are defined and never used | **Open** — `matches`, `players`, `turns`, `darts`, `rooms`, `room_members` still have no writer |
| 6 | Online play is a dead end that advertises itself as live | **Partly** — the overselling is gone; the rooms are not built |
| 7 | Correction only reaches the latest dart | **Closed** — Cycle 5. Any completed visit can be rewound to, in every mode |
| 8 | Twenty AI levels share one aim policy | **Closed for X01** — Cycle 9. The other modes have no AI opponent at all |
| 9 | "Always-on" voice is a single clip | **Open** — recorded in Cycle 9 with the reason |
| 10 | The checkout companion talks nonsense at the start of a leg | **Closed** — Cycle 4 |
| 11 | Visit history spends a desktop column on nothing | **Closed** — Cycle 4 |
| 12 | Fonts are fetched with a render-blocking import | **Closed** — Cycle 4 |
| 13 | Dead theme definitions shadow the live ones | **Closed** — Cycle 4 |
| 14 | The account hub shows membership and nothing else | **Open** — it needs gap 5 first |
| 15 | There is no browser test harness | **Closed** — Cycle 4. 102 tests, and they run against production |
| 16 | Observability, analytics, and rollback are undocumented | **Open** |

Nine closed, three partly, four open. One defect was found by the harness rather
than by the audit and is still open: `/api/auth/get-session` answers 500 where
Dartio's own routes answer a deliberate 503, so a Neon outage reports a server
fault instead of degrading.

## Verified receipts — 2026-07-28

- **Production runs the suite.** `DARTIO_BASE_URL=https://dartioopus46.vercel.app
  pnpm test:browser` passed 102/102 against the live deployment in 47 seconds —
  every route loading without horizontal overflow or a console error at three
  viewports, keyboard focus rings, the regulation dartboard gate, three-theme
  contrast, entitlement lock states, match resume, visit rewind, keyboard
  scoring, Cricket, and the four round modes.
- **Deterministic gates on `main`:** TypeScript clean, ESLint clean at
  `--max-warnings=0`, 367 unit tests across 29 files, production build.
- The suite grew from 284 unit tests and zero browser tests at the start of the
  phase to 367 and 102.
- Seven PRs merged, each one cycle-slice, each green before merge.

## What is genuinely left

These are the honest remainder, not a wish list:

1. **Persisted history and statistics.** The event log is the natural thing to
   write; the schema is already deployed on both Neon branches. This unblocks
   the account hub, cross-device continuity, and the deep-stats entitlement that
   pricing already advertises as coming.
2. **Server-authoritative online rooms.** Create and join codes, versioned
   events, optimistic locking by turn number, reconnect, ownership handoff,
   spectators, degradation to polling.
3. **Continuous voice.** Voice-activity detection, silence segmentation,
   automatic re-arming, a correction queue, and a vocabulary per mode.
4. **The three practice drills** — Checkout Lab, Doubles Matrix, Scoring Sprint —
   which are attempt ledgers rather than games and want the progress surface
   from item 1.
5. **AI opponents for Cricket and the round modes.** The tactical chooser is
   X01-shaped; each mode needs its own policy against its own rules.
6. **Observability, analytics, and a written rollback path**, including the
   `get-session` 503 correction.
7. **Live Stripe activation.** Everything is proven in sandbox; nothing is live.

## Recommendation

Items 1 and 2 are one phase: both are the same work — putting the event log on
the server — approached from different ends. Doing history first makes rooms
cheaper, because a room is a shared log with a writer lock. Items 3 to 7 are
independent and can be sequenced by whatever matters most to a player.
