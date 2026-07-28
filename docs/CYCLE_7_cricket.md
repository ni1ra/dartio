# Cycle 7 — A Second Mode, and the Architecture That Made It One

Status: active

Derived from: `PHASE_1_v1_foundation.md` and gap 3 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Ship Cricket as a real game: standard, cut-throat, and tactics.
- [x] Prove a mode can be added without editing the mode beside it.
- [x] Give Cricket the board, the pad, the keyboard, correction, and resume for free.
- [x] Stop the practice catalogue advertising Cricket as a coming feature.

## Verified receipts — 2026-07-28

- **Cricket is playable end to end.** Marks close on three, a treble is three
  marks, a double bull is two and an outer bull is one, and a number closed by
  every player is dead. Standard scores overflow for the closer while an
  opponent is open; cut-throat inflicts it on every open opponent and the lowest
  score wins; tactics scores nothing at all and is won purely on closing out. A
  round cap ends the match and awards it on marks, then points, and declines to
  name a winner when both are level. `winByTwo` refuses a win that is only level
  on points.
- **The architecture claim is concrete, not aspirational.** `src/domain/cricket.ts`
  imports nothing from X01, and X01 imports nothing from Cricket. What they share
  is the *shape* — immutable state, pure reducers, one turn record per completed
  visit — which is why `cricket-log.ts` is a near-copy of `x01-log.ts` rather
  than a coupling. `/play/match` picks a component from one search parameter and
  knows nothing about what either contains.
- **The board became a component.** The SVG, the ring geometry, and the
  click-to-score mapping moved out of `x01-match.tsx` into
  `src/components/dartboard.tsx`, so Cricket inherited a renderer that already
  passes the regulation gate instead of copying one. Both modes now point at the
  same object; `tests/browser/dartboard.spec.ts` covers it once for both.
- **Cricket inherited the shared machinery unchanged**: the per-dart pad, the
  keyboard scheme from Cycle 6, the visit-rewind correction from Cycle 5, and
  local-storage resume — with its own key and its own zod schema, so the two
  modes can never rehydrate into each other.
- **The scoreboard is a table, not a grid of divs.** Marks / number / marks, with
  the number as a row header, so a screen reader announces which number a mark
  belongs to without extra scaffolding. Marks render in the scorer's shorthand:
  slash, cross, circled.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 346 unit
  tests across 27 files (from 330), production build. Browser proof: 87 tests
  across the three viewports, all passing, including four new Cricket tests — the
  board rendering seven numbers with the bull last, a treble closing outright,
  points arriving only after the number is closed, keyboard scoring plus resume
  plus rewind all working through the inherited machinery, and tactics scoring
  nothing.
- The practice catalogue now links Cricket rather than labelling it "COMING
  NEXT", and `GAME_MODES.cricket.status` reads `playable`.

## Open

- Cricket has no AI opponent yet: the setup screen offers it against a local
  friend. A Cricket bot needs its own aim policy, which belongs with the AI
  calibration work rather than here.
- Cricket has no voice commands. The shared command path exists; the vocabulary
  is mode-specific and is not written.
