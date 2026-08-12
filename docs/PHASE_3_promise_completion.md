# Phase 3 — Promise Completion

Status: closed 2026-08-12.

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
- **Out of scope, unchanged from Phase 2:** live Stripe activation. Phase 3
  proved the full subscription lifecycle in Sandbox; the operator authorized a
  real transaction only after closure, so Live activation begins in Phase 4.
  Club checkout and an admin surface remain decided-not-built commissions.

## Queue

- [x] **Cycle 23 — Room spectators.** A third account joins a live room by code as
  a read-only seat: a membership row with no `players` row, so the read-only
  promise is structural — no seat, no write, no appearance in anyone's history.
  Watching costs `online_multiplayer`, the same as sitting. Spectators are
  counted, not named. `/friends` gains "Watch instead" and its promise chip
  splits: spectators Live, handover still Planned. Closed on production
  evidence 2026-08-11 — PR #26, live three-identity proof on preview, all
  verify gates and the rooms browser spec green against production after
  merge. See `past_work/phase_3/CYCLE_23_spectators.md`.
- [x] **Cycle 24 — Room handoff and lifecycle.** Deliberate handover, host-departure
  semantics, one serialized terminal lifecycle across every mutation,
  `verify-rooms-live` as a pnpm script, and the deliberately held
  `onlineMultiplayer: "coming_soon"` flag retired now that the whole promise is
  true. Physical expiry purge is explicitly parked: the campaign forbids
  destructive database operations, and expired rooms are already unreachable.
  PR #27's first candidate reached production; corrective PR #28 then repeated
  Preview, CI, merge, and Production proof and closed the lifecycle on
  `705b98d` on 2026-08-11. See
  `past_work/phase_3/CYCLE_24_handoff.md`.
- [x] **Cycle 25 — Levels 9–20 for every mode, server rules-blind.** What is paid is
  execution quality, not aim policy. A mode-agnostic throw authority samples the
  landing for {target, level} behind the `advanced_ai` gate; the client keeps the
  rules, the server keeps the skill, and the server still never learns a mode.
  Shipped in PR #29; exact Preview paid proof passed. Production's standing QA
  account is Free, so that separate paid-live receipt remains parked rather than
  being forged. See `past_work/phase_3/CYCLE_25_ai_throw.md`.
- [x] **Cycle 26 — Voice confidence end to end.** The hold-queue is built and
  starves; `POST /api/voice/transcribe` returns no confidence. Research the
  current OpenAI transcription API first, wire a real signal through, and put the
  voice component under test on the way. Shipped in PR #31 with exact Production
  CI, deployment, auth/history/rooms, targeted voice, and full browser proof.
  Paid-provider proof remains parked on the same honest Free-QA boundary. See
  `past_work/phase_3/CYCLE_26_voice_confidence.md`.
- [x] **Cycle 27 — Match replay.** The manifesto promises a board that records,
  explains, and replays every dart; migration 0006 made stored visits lossless and
  nothing plays them back. Any stored match, dart by dart, on the regulation
  board, every mode through one rebuild path. Shipped in PR #32 as
  `d64997d5d8c913e94281fb0bea1585dcde9a7a52`; exact Preview, main CI,
  Production deployment, authenticated detail/history, rooms, touched replay,
  and the complete three-viewport browser matrix all passed. See
  `past_work/phase_3/CYCLE_27_match_replay.md`.
- [x] **Cycle 28 — Statistics with depth, on an honest data layer.** Per-double
  checkout table, trends over recent matches, per-mode splits, drill progress —
  withheld from Free on the server exactly as today. Same cycle: the missing
  `matches.completed_at` index under every history read, and the batch-rollback
  behaviour of `POST /api/matches` exercised under injected failure rather than
  assumed. Shipped in PR #33 as
  `29aa289bb2c5ee44e574017fccc0d457acfedd71`; the isolated rollback proof left
  zero residue, migration `0007` preserved all Preview and Production counts,
  and exact-SHA CI, Preview, Production, auth/history/rooms, focused statistics,
  and the complete 284-run/4-skip browser matrix passed. See
  `past_work/phase_3/CYCLE_28_statistics_depth.md`.
- [x] **Cycle 29 — At-the-oche resilience.** `error.tsx` boundaries that tell a
  player their match survived; a wake lock so the screen does not dim mid-leg; a
  `public/` with icons and an installable manifest; the versioned-zod resume
  treatment for the round modes and drills that X01 already has; an honest offline
  audit with no service-worker claims beyond what is real. Shipped in PR #34 as
  `6f0c2517cae6d00dd3465ccff68624b52517b51c`; exact Preview, main CI,
  Production deployment, auth/history/rooms/integrity, focused resilience, and
  the complete 326-run/4-skip browser matrix all passed. See
  `past_work/phase_3/CYCLE_29_oche_resilience.md`.
- [x] **Cycle 30 — Phase 3 closure and Sandbox promotion.** Re-score every claim
  against `main`, remove stale public labels, lock the existing Hosted Checkout
  promotion boundary, and redeem one one-use Pro-product-only 100%-off code in
  Stripe Sandbox. Prove the next full invoice is discounted to zero, signed
  webhook access enables paid AI/voice, and Portal cancellation prevents a later
  renewal. Then repeat full Production gates, archive to `past_work/phase_3/`,
  and name what is honestly left. Shipped in PR #35 as
  `9764652a23d509c117d2c649790b7b1466dc7d09`; exact-head Preview, PR CI,
  main CI, Production deployment, auth/history/rooms, paid AI/voice, and the
  complete 329-run/4-skip Production browser matrix passed. See
  `past_work/phase_3/CYCLE_30_phase_closure.md`.

## Phase-level gates

Nothing here is closed until the browser suite passes against the live production
deployment at 390×844, 834×1112, and 1440×1000, and `pnpm verify:auth`,
`pnpm verify:history`, and `pnpm verify:rooms` all pass against it — a deployment
can answer 200 on every route while nobody can sign in or persist a match.

## Closure receipt

Phase 3 closed on 2026-08-12 after PR #35 merged. Main CI run
[31643931252](https://github.com/ni1ra/dartio/actions/runs/31643931252)
passed on exact merge SHA `9764652a23d509c117d2c649790b7b1466dc7d09`.
Production deployment `dpl_HMwfhm7kpoV4HaHyaiUwgEfqabhH` was READY and owned
the canonical Dartio alias. Authenticated history, rooms, paid AI, paid voice,
and a clean second full browser run all passed against Production. Cycles 23–30
are archived under `past_work/phase_3/`; Phase 4 owns the explicitly authorized
Live billing activation and the remaining credibility work.
