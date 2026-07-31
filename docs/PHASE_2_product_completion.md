# Phase 2 — Product Completion

Status: closed 2026-07-31. Opened 2026-07-30.

Phase 1 shipped a live product and closed nine of sixteen audited gaps.
`CYCLE_10_phase_closure.md` named the seven things genuinely left, and
`CYCLE_11_lain_audit.md` added what Lain found in his own test pass. This phase is
those two lists, worked in the order the closure doc recommended: the event log
gets a server-side writer first, because history, statistics, rooms, drills, and
the account hub all wait behind it.

Eleven cycles, 12 through 22, continuing the repo's own numbering. Features and
gap-filling first, simplification and audit last.

## Standing rules for this phase

- One cycle, one branch, one PR. Green gates before merge, production verified
  after — `main` is the production branch, so a merge is a deploy.
- Gates run unpiped and their exit code is read. `pnpm test:browser | tail -25`
  reports `tail`'s status, which is how a failed suite and a failed *install* both
  once read as success.
- Checkboxes flip on a tool result from the session that flipped them.
- **Out of scope:** live Stripe activation. Everything stays in sandbox until a
  real transaction is explicitly authorized.

## Queue

- [x] **Cycle 12 — Persisted match history.** Give the event log a writer. Closed on
  production evidence: a real signed-in match filed and read back, and the four
  tables that had never held a row now hold one. See `CYCLE_12_match_history.md`.
- [ ] **Cycle 13 — Statistics and the account hub.** Three-dart average, checkout
  percentage, doubles, best leg, mode breakdown, recent matches, on `/account`.
- [x] **Cycle 14 — Rooms exist.** Open one, join by code, one shared record with a
  writer lock. **Scope moved, deliberately:** wiring the match screen to a room turned
  out to be cycle-sized on its own, so playing inside a room moved to 15 and this
  cycle ends at the lobby — which says so on the page. See `CYCLE_14_rooms.md`.
- [x] **Cycle 15 — Playing inside a room, and reconnect.** Two accounts throw at the
  same match from different screens, and either can reload and come back. Rebuilding
  from the room's own record makes join, reload, and catch-up one code path. See
  `CYCLE_15_room_play.md`. Spectators and host handover split out, still marked
  planned on `/friends`.
- [x] **Cycle 16 — The three practice drills.** Checkout Lab, Doubles Matrix, and
  Scoring Sprint. All nine catalogue rows are playable and the COMING NEXT branch is
  gone. See `CYCLE_16_drills.md`.
- [x] **Cycle 17 — Opponents for Cricket and the round modes.** Each mode brings its
  own idea of what to aim at, and the two modes with only one right answer say so
  rather than inventing variety. Levels 1–8, matching the free tier. See
  `CYCLE_17_mode_ai.md`.
- [x] **Cycle 18 — Continuous voice.** Clips shaped by speech rather than by a
  stopwatch, automatic re-arming, `confirm`/`cancel` given something to act on, and
  a vocabulary per mode. See `CYCLE_18_voice.md`.
- [x] **Cycle 19 — Cycle 11's remainder.** Five rows ticked against production
  rather than against the diff, the screenspace complaint measured and fixed, and the
  admin role decided rather than built. See `CYCLE_19_audit_remainder.md`.
- [x] **Cycle 20 — Observability, analytics, rollback.** Structured events with an
  enforced allow-list, the `get-session` 500 that should have been a 503, and a
  rollback runbook that is a procedure rather than a fact. See `CYCLE_20_observability.md`.
- [x] **Cycle 21 — Simplification and the dead-code sweep.** Three duplications
  removed and two unused functions deleted, with the test count identical before and
  after. See `CYCLE_21_simplify.md`.
- [x] **Cycle 22 — Audit, proof, closure.** Sixteen of sixteen audited gaps closed,
  six of the seven remaining items delivered, and the seventh deliberately excluded.
  See `CYCLE_22_phase_closure.md`.

## Phase-level gates

Nothing here is closed until the browser suite passes against the live production
deployment at 390×844, 834×1112, and 1440×1000, and `pnpm verify:auth` passes
against it. A deployment can answer 200 on every route while nobody can sign in;
that check is the only one that catches it.


## Closure — 2026-07-31

Eleven cycles, eleven pull requests, each green before merge and each verified on
production after it. **All sixteen audited gaps are closed**, along with the
`get-session` defect the harness found rather than the audit. Six of the seven
items Cycle 10 called the honest remainder are delivered; the seventh, live Stripe
activation, was excluded at the start of the phase and remains Lain's call.

367 unit tests became 547, 120 browser checks became 159, and 19 routes became 25.

`CYCLE_22_phase_closure.md` scores every gap individually and names what is
honestly left: spectators and ownership handoff in rooms, levels 9–20 for the
non-X01 modes, a confidence signal for voice, live Stripe, and the MCP tooling row
that lives outside this repository.
