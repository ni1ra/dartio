# Cycle 27 — Match Replay

Status: active on `codex/cycle-27-match-replay`.

Fifth cycle of `PHASE_3_promise_completion.md`. Dartio already stores a generic
`MatchRecord` for every completed mode, but the account surface exposes only a
summary. This cycle adds one owner-protected detail boundary and one generic
rebuild path that can play every stored match back on the regulation board.

## Truth boundary

Migration `0006` made every stored visit lossless, but an aggregate visit does
not contain individual beds or coordinates. It contains only `dartsThrown` and
`aggregateScore`. Replay must therefore distinguish evidence it has from
evidence it does not have:

- an exact visit yields one frame per stored dart, using its stored coordinates
  when present and a representative point only when that dart has a stored bed;
- an aggregate visit yields one explicit unknown-landing frame per declared
  dart, with no board marker and no invented bed;
- the authoritative `scoreAfter` takes effect only on the visit's last frame;
  intermediate per-dart scores are not reverse-engineered through mode rules;
- turns and darts are ordered by their recorded sequence numbers before frames
  are built.

That makes replay honest for old aggregate matches while preserving the full
physical trail for exact matches. It also keeps mode rules out of the history
reader: X01, Cricket, the four round modes, the three drills, and an unknown
future mode all use the same timeline builder.

## Boundary

`GET /api/matches/:id` returns only a completed match owned by the current user.
Missing and not-owned IDs share the same 404 response. Success contains the
public match ID, completion time, owner seat, and reconstructed `MatchRecord`;
database player, turn, dart, and user IDs never cross the boundary. Every
success and refusal is `private, no-store`.

The detail route is read-only and adds no entitlement or history-depth rule.
Cycle 28 owns statistics depth and the missing `completed_at` index; Cycle 27
does not smuggle either concern into replay and needs no migration.

## Product contract

- Recent-match rows lead to a stable account replay URL.
- The regulation board has an explicit presentation mode with no pointer,
  keyboard, or focus scoring path.
- First, previous, play/pause, next, and last controls move through the same
  deterministic frame list. Timers are cleaned up and reduced-motion users are
  never forced into autoplay.
- The active player, visit, dart, notation, aggregate limitation, and
  authoritative before/after score remain visible together.
- Loading, signed-out, not-found, and unavailable states are distinct and give
  a safe retry or route back to the account.
- The complete surface remains operable without horizontal overflow at
  390×844, 834×1112, and 1440×1000.

## Queue

- [x] Add the generic, deterministic replay timeline with exact and aggregate
  truth-boundary coverage across every known mode and an unknown mode.
- [x] Add the owner-protected detail reader, strict private route, and strict
  product client without leaking internal identifiers.
- [x] Add the read-only regulation board, replay controls, account discovery,
  truthful aggregate state, accessibility, and three-viewport browser stories.
- [x] Extend `pnpm verify:history <deployment-url>` through a real detail read
  of the synthetic match it files, plus anonymous refusal.
- [x] Full local typecheck, lint, unit, build, focused browser, and full browser
  gates on the frozen candidate.
- [ ] Exact Preview deployment, authentication/history proof, touched browser
  matrix, full browser matrix, and exact-head CI.
- [ ] Merge the green exact revision and repeat the standing production gates,
  touched browser, full browser, exact deployment, and main CI proof.

## Release safety

Replay reads existing rows and writes nothing. The history verifier continues
to file its deliberately tiny synthetic D20 match through the public API, then
reads that same match through the detail boundary. It neither mutates schema nor
deletes data. No Stripe, OpenAI, or room authority is involved in this cycle.

## Receipts

Frozen local candidate, 2026-08-12:

- `pnpm typecheck` and `pnpm lint`: exit 0.
- `pnpm test`: 56 files / 851 tests passed, exit 0 in 2.54 seconds.
- `pnpm build`: exit 0, including the new dynamic account replay page and
  private match-detail route.
- `CI=1 pnpm exec playwright test tests/browser/match-replay.spec.ts`: 27/27
  passed across 390×844, 834×1112, and 1440×1000, exit 0 in 163.8 seconds.
- `CI=1 pnpm test:browser`: all 276 collected checks completed successfully,
  exit 0 in 261.9 seconds. The four pre-existing, deliberate viewport skips
  leave 272 executed checks and 4 skips.
- Independent final audit repeated full typecheck and lint, 143 focused tests,
  both verifier syntax checks, diff-check, and a targeted secret scan with no
  blocker. The audit found and closed verifier credential/redirect seams,
  impossible dart ordinals on both storage boundaries, aggregate replay-reader
  coverage, new-leg score authority, and mode-neutral bust explanation.

Preview, pull-request CI, merge, and Production receipts remain deliberately
open until they run against one exact revision.
