# Cycle 22 — Phase Closure

Status: closed 2026-07-31

Closes the eleven-cycle run that began on 2026-07-30 with
`PHASE_2_product_completion.md`. Every claim below is scored against the code on
`main` and, where it is a product claim, against the live production deployment.

## The sixteen audited gaps, re-scored

`artifacts/GAP_AUDIT_2026-07-28.md` wrote down sixteen. `CYCLE_10_phase_closure.md`
scored nine closed, three partly, four open. Scored again now:

| # | Gap | Then | Now |
|---|---|---|---|
| 1 | The match does not fit a phone | Closed | Closed |
| 2 | The segmented control has no selected state | Closed | Closed |
| 3 | Eight of nine catalogue rows are not games | **Partly** | **Closed** — all nine playable, Cycle 16 |
| 4 | A match cannot survive a reload | Closed | Closed |
| 5 | Six tables are defined and never used | **Open** | **Closed** — all six have writers, Cycles 12 and 14 |
| 6 | Online play is a dead end that advertises itself | **Partly** | **Closed** — rooms are real and playable, Cycles 14 and 15 |
| 7 | Correction only reaches the latest dart | Closed | Closed |
| 8 | Twenty AI levels share one aim policy | **Partly** (X01 only) | **Closed** — every mode has its own policy, Cycle 17 |
| 9 | "Always-on" voice is a single clip | **Open** | **Closed** — Cycle 18 |
| 10 | The checkout companion talks nonsense | Closed | Closed |
| 11 | Visit history spends a column on nothing | Closed | Closed |
| 12 | Fonts fetched with a render-blocking import | Closed | Closed |
| 13 | Dead theme definitions shadow the live ones | Closed | Closed |
| 14 | The account hub shows membership and nothing else | **Open** | **Closed** — Cycle 13 |
| 15 | There is no browser test harness | Closed | Closed |
| 16 | Observability, analytics and rollback undocumented | **Open** | **Closed** — Cycle 20 |

**Sixteen of sixteen.** The `get-session` defect the harness found rather than the
audit is also closed, in Cycle 20.

## The seven things Cycle 10 called the honest remainder

1. **Persisted history and statistics** — done, Cycles 12 and 13.
2. **Server-authoritative rooms** — done for create, join, ordering, the writer lock,
   play and reconnect, Cycles 14 and 15. Spectators and ownership handoff are not
   built.
3. **Continuous voice** — done, Cycle 18.
4. **The three practice drills** — done, Cycle 16.
5. **AI opponents for Cricket and the round modes** — done at levels 1–8, Cycle 17.
6. **Observability, analytics and a rollback path** — done, Cycle 20.
7. **Live Stripe activation** — **not done, and deliberately excluded** from this
   phase at its start. Everything remains in sandbox.

## What is honestly left

Named because a phase that ends claiming completeness is the one nobody trusts:

- **Spectators and ownership handoff in rooms.** Split out of Cycle 15 when playing
  inside a room turned out to be cycle-sized on its own. `/friends` marks both
  planned.
- **Levels 9–20 for Cricket and the round modes.** They stop at 8, which is exactly
  the free tier, because the route that authorizes higher levels speaks X01 and
  teaching it every mode's rules is the thing the architecture exists to avoid.
- **A confidence signal for voice.** The queue that holds a doubtful transcription is
  built and tested; `POST /api/voice/transcribe` returns no confidence, so nothing
  reaches it in production. Nothing in the interface claims otherwise.
- **Live Stripe activation.** Lain's call, and a release gate rather than a task.
- **The MCP tooling row** from Cycle 11, which is outside this repository.

## What this phase cost and produced

- **367 → 547 unit tests**, across 29 → 44 files.
- **120 → 159 browser checks**, at 390×844, 834×1112 and 1440×1000.
- **19 → 25 routes.** One migration, `0006`, additive, applied to preview then
  production and reconciled on both.
- Eleven cycles, eleven pull requests, each green before merge and each verified on
  production after it.

## Four defects found by gates rather than by a person

Worth recording because each one argues for a gate that did not exist before:

1. **A corrected match left the wrong version in history.** Undo and Correct stayed
   live on a finished match, and the record is filed once. Found reviewing Cycle 12.
2. **The room write was a Postgres syntax error** that all 473 unit tests passed
   straight through — a fake database never renders SQL. Found by two real
   identities in a real room, which is why `verify-rooms-live.mjs` now exists.
3. **Room routes read the request body before authenticating**, so an unauthenticated
   caller learned which field was malformed. Found by `verify:rooms` against
   production on its first run.
4. **The observability logger spread the caller's object**, so the types forbade an
   email or a token and nothing enforced it. Found by a test written to reach past
   the types.

## Verified receipts — 2026-07-31

Against `https://dartioopus46.vercel.app`:

- `pnpm verify:auth` — the origin is accepted by Neon Auth.
- `pnpm verify:rooms` — every room endpoint refuses a request with no session, and a
  plan without online play is refused with 402 before a room exists.
- `pnpm verify:history` — a real signed-in match filed and read back; statistics
  report five matches at a 120.00 three-dart average; the deep figures are withheld
  from a Free plan and absent from the payload; both endpoints refuse an anonymous
  request.
- The match page measures **1000 px of document in a 1000 px viewport**, with the
  command dock ending at the bottom edge.
- **The full browser suite against production: 155 passed, 4 skipped**, at 390×844,
  834×1112 and 1440×1000, run unpiped with the exit code read.
