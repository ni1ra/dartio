# Phase 2 — Product Completion

Status: active. Opened 2026-07-30.

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
- [ ] **Cycle 14 — Server-authoritative rooms.** Create and join by code, versioned
  events, optimistic locking by turn number. **Decided before starting:** `/friends`
  already labels reconnect, spectators, and server-authoritative play as `Planned ·`,
  so the page is honest today and must stay honest at every point in between. Cycle
  14 promotes only the claim it makes true and leaves the other two marked planned;
  a room that cannot yet survive a reconnect says so where a player will see it
  before joining. The hazard is a run that stops between 14 and 15 leaving
  production with live rooms under promises 15 was going to keep.
- [ ] **Cycle 15 — Rooms: reconnect, ownership handoff, spectators**, and honest
  degradation to polling.
- [ ] **Cycle 16 — The three practice drills.** Checkout Lab, Doubles Matrix,
  Scoring Sprint — the last `href="#"` rows in the catalogue.
- [ ] **Cycle 17 — AI opponents for Cricket and the round modes.** Each mode needs
  its own policy against its own rules; `chooseAiAim` is X01-shaped.
- [ ] **Cycle 18 — Continuous voice.** Activity detection, silence segmentation,
  re-arming, a correction queue, a vocabulary per mode.
- [ ] **Cycle 19 — Cycle 11's remainder.** Command-dock padding, the dead band
  below it, role versus entitlement, and the admin-role decision.
- [ ] **Cycle 20 — Observability, analytics, rollback**, including the
  `get-session` 500 that should be a 503.
- [ ] **Cycle 21 — Simplification and the dead-code sweep.**
- [ ] **Cycle 22 — Audit, proof, closure.**

## Phase-level gates

Nothing here is closed until the browser suite passes against the live production
deployment at 390×844, 834×1112, and 1440×1000, and `pnpm verify:auth` passes
against it. A deployment can answer 200 on every route while nobody can sign in;
that check is the only one that catches it.
