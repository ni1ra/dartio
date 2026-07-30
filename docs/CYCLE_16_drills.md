# Cycle 16 — The Three Practice Drills

Status: active

Checkout Lab, Doubles Matrix, and Scoring Sprint were the last three `href="#"`
rows in the catalogue, labelled COMING NEXT for the whole of Phase 1. All nine
rows on `/practice` are now playable, and the branch that used to render an inert
card is gone rather than left waiting for a mode that may never need it.

## They are not games

Nobody wins a drill. They are attempt ledgers: a fixed list of things to aim at,
each attempt worth up to three darts, each either taken or not. That shape is the
same for all three, so what differs is one `DrillRules` entry — what you aim at,
what counts as taking it, and what the attempt is worth. Adding a fourth drill is
a table entry, exactly as adding a fifth round mode is.

- **Checkout Lab** — twelve classic finishes, easiest first. A finish must land
  exactly *and* on a double; a visit totalling forty that ends on a single twenty
  is not a checkout, and the drill says so.
- **Doubles Matrix** — every double from one to twenty, then the bull. The single
  and the treble of the number do not count.
- **Scoring Sprint** — ten visits, everything counts, sixty or more is a hit. A
  visit under sixty still keeps its points; it is a miss, not a void.

An attempt ends the moment it is decided rather than at three darts. Landing the
double on the first dart, or overshooting a checkout, settles it — making a player
throw two more darts at nothing would be a worse drill and a dishonest scoreline.

## What they inherit for free

Nothing in `drills.ts` imports X01, Cricket, or the round modes. Because a drill
brings a pure reducer and an event log like every other mode, it inherits undo,
resume after a reload, deterministic replay, and persistence to history — through
the same `MatchRecord` contract, so the server learned nothing new. A drill is one
seat with no winner, and its before/after pair is the running total in the drill's
own unit: checkouts taken, doubles hit, or points scored.

## Verified receipts — 2026-07-31

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **502 tests across 39 files**, up from 487 across 38. Build green.
- **15 drill browser checks pass at 390×844, 834×1112, and 1440×1000**: every
  practice row playable with none left coming soon, Doubles Matrix taking the
  attempt on the double and advancing, Checkout Lab refusing a forty that did not
  finish on a double, Scoring Sprint counting everything, and a drill resuming
  after a reload.
