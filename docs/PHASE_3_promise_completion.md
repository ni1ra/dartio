# Phase 3 — Promise Completion

Status: active. Opened 2026-08-11.

Phase 2 closed with all sixteen audited gaps shut and named its honest remainder:
spectators and ownership handoff in rooms, levels 9–20 for the non-X01 modes, a
confidence signal for voice, and live Stripe. This phase is that remainder plus
what the product's own manifesto still promises and stores data for — replay,
depth of statistics, and survival at the oche.

Lain's directive for the endgame: two phases, fifteen cycles, existing remaining
work integrated, run unattended. This is the first: eight cycles, 23 through 30,
continuing the repo's numbering. The second is `PHASE_4_credibility_campaign.md`.
The full plan and its execution contract were approved on 2026-08-11.

## Standing rules for this phase

- One cycle, one branch, one PR. Green gates before merge, production verified
  after — `main` is the production branch, so a merge is a deploy.
- Gates run unpiped with their exit codes read.
- Checkboxes flip on a tool result from the session that flipped them.
- Additive migrations only, preview branch first, escape path and snapshot
  recorded before either.
- **Out of scope, unchanged from Phase 2:** live Stripe activation. Sandbox until
  a real transaction is explicitly authorized. Also out: the Club checkout and an
  admin surface, both decided-not-built commissions.

## Queue

- [x] **Cycle 23 — Room spectators.** A third account joins a live room by code as
  a read-only seat: a membership row with no `players` row, so the read-only
  promise is structural — no seat, no write, no appearance in anyone's history.
  Watching costs `online_multiplayer`, the same as sitting. Spectators are
  counted, not named. `/friends` gains "Watch instead" and its promise chip
  splits: spectators Live, handover still Planned. Closed on production
  evidence 2026-08-11 — PR #26, live three-identity proof on preview, all
  verify gates and the rooms browser spec green against production after
  merge. See `CYCLE_23_spectators.md`.
- [ ] **Cycle 24 — Room handoff and lifecycle.** Deliberate handover, host-departure
  semantics, one serialized terminal lifecycle across every mutation,
  `verify-rooms-live` as a pnpm script, and the deliberately held
  `onlineMultiplayer: "coming_soon"` flag retired now that the whole promise is
  true. Physical expiry purge is explicitly parked: the campaign forbids
  destructive database operations, and expired rooms are already unreachable.
  PR #27's first candidate reached production, but Cycle 24 remains open until
  the corrective lifecycle branch repeats Preview, CI, merge, and production
  proof. See `CYCLE_24_handoff.md`.
- [ ] **Cycle 25 — Levels 9–20 for every mode, server rules-blind.** What is paid is
  execution quality, not aim policy. A mode-agnostic throw authority samples the
  landing for {target, level} behind the `advanced_ai` gate; the client keeps the
  rules, the server keeps the skill, and the server still never learns a mode.
- [ ] **Cycle 26 — Voice confidence end to end.** The hold-queue is built and
  starves; `POST /api/voice/transcribe` returns no confidence. Research the
  current OpenAI transcription API first, wire a real signal through, and put the
  594-line `voice-control.tsx` under test on the way.
- [ ] **Cycle 27 — Match replay.** The manifesto promises a board that records,
  explains, and replays every dart; migration 0006 made stored visits lossless and
  nothing plays them back. Any stored match, dart by dart, on the regulation
  board, every mode through one rebuild path.
- [ ] **Cycle 28 — Statistics with depth, on an honest data layer.** Per-double
  checkout table, trends over recent matches, per-mode splits, drill progress —
  withheld from Free on the server exactly as today. Same cycle: the missing
  `matches.completed_at` index under every history read, and the batch-rollback
  behaviour of `POST /api/matches` exercised under injected failure rather than
  assumed.
- [ ] **Cycle 29 — At-the-oche resilience.** `error.tsx` boundaries that tell a
  player their match survived; a wake lock so the screen does not dim mid-leg; a
  `public/` with icons and an installable manifest; the versioned-zod resume
  treatment for the round modes and drills that X01 already has; an honest offline
  audit with no service-worker claims beyond what is real.
- [ ] **Cycle 30 — Phase 3 closure.** Re-score every claim against `main` and the
  live deployment, full browser suite and the three verify gates against
  production, archive to `past_work/phase_3/`, name what is honestly left.

## Phase-level gates

Nothing here is closed until the browser suite passes against the live production
deployment at 390×844, 834×1112, and 1440×1000, and `pnpm verify:auth`,
`pnpm verify:history`, and `pnpm verify:rooms` all pass against it — a deployment
can answer 200 on every route while nobody can sign in or persist a match.
