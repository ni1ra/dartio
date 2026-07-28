# Cycle 9 — Twenty Levels That Play Differently

Status: active

Derived from: `PHASE_1_v1_foundation.md` and gaps 8 and 9 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Make AI levels differ in decision quality, not only in miss radius.
- [x] Route tactical levels through the same checkout planner a human is offered.
- [x] Prove the ladder separates with a benchmark rather than an assertion.
- [ ] Replace the manually resumed voice clip with continuous opt-in capture.

## Verified receipts — 2026-07-28

- **The ladder was cosmetic and now is not.** Every level shared one aim policy
  — bull at 50, direct low doubles, treble twenty otherwise — so a level 3 and a
  level 19 chose identical targets and differed only in how badly they executed
  them. `aiTactics` now splits the range: levels 1–5 are novices who aim their
  biggest number and take whatever double they land on; 6–12 are competent and
  finish through the checkout planner when a route exists; 13–20 are experts who
  also plan a setup visit when no finish does.
- **Tactical levels use the product's own planner**, so their decisions are
  defensible rather than arbitrary — the bot takes the route Dartio would
  recommend to a human in the same position.
- **The difference is measurable, not asserted.** From 135 with three darts a
  novice throws treble twenty; an expert opens on the bull, which is the
  professional route. From 169 — a bogey, where no three-dart double-out exists
  — a novice throws another treble twenty while an expert plans a leave. Over
  seeded 501 leg simulations, level 10 finishes in fewer darts than level 2 and
  level 19 finishes in under 70% of the novice's darts.
- **Two existing tests changed meaning and were corrected rather than
  re-pointed.** One asserted that the AI busts from 3 by throwing treble twenty;
  a tactical level now plays S1 then D1, which is the right darts. It is pinned
  to a novice level and a second test covers the tactical behaviour. The other
  compared out rules from 60 and is likewise pinned to a novice, because a
  tactical level routes around the bust the case exists to demonstrate.
- **The accuracy curve is asserted directly** on `aiSpread` rather than by
  sampling; monotonicity is a property of the model, and simulating it only adds
  noise. The first version of that test simulated 400 visits per level, took 105
  seconds, and timed out — it measured nothing the formula did not already say.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 367 unit
  tests across 29 files (from 361), production build.

## Open

- **Always-on voice did not land.** It is not a tuning change: continuous
  capture needs voice-activity detection, silence segmentation, automatic
  re-arming, and a correction queue, which is a rewrite of the client audio
  lifecycle rather than an extension of it. The current push-to-talk lifecycle
  is honest about what it does — it says "always-on mode is off" — so shipping a
  half-continuous version would have been worse than shipping none. It carries
  to the next phase with the mode-specific voice vocabularies, which have the
  same owner.
- Cricket and the round modes still have no AI opponent. The tactical chooser is
  X01-shaped; each mode needs its own aim policy against its own rules.
