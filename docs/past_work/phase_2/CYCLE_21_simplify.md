# Cycle 21 — Simplification and the Dead-Code Sweep

Status: active

Nine cycles of new work left duplication behind. This removes it without changing a
single behaviour — **547 tests before, 547 after**, which is the point: a
simplification that changes what the product does is not a simplification.

## Three things written more than once

**The event-to-dart conversion, four times.** Every mode's log stored the same
thing — a bed, a multiplier, and where the dart physically landed if it was thrown
at a board — and each had its own three-line copy of turning that back into a
`Dart`. Four copies is three chances to disagree about what an absent landing point
means. It now lives in `darts.ts`, which every mode already shares, so no mode
learns anything about another by using it. `eventDart` stays as a name callers
already use.

**The unique-violation check, twice.** Once for the identity upsert and once for a
room-code collision, both walking the cause chain looking for the same `23505`. Two
copies of a magic number is two places to get it wrong. Now `src/db/errors.ts`.

**The dart row, twice.** History and rooms both wrote to the `darts` table and both
carried their own microunit conversion — a landing point is stored as an integer so
it survives the round trip, because as a float `0.1` comes back as
`0.09999999999999998`. Two copies of that reasoning is one chance for them to drift
into storing different things. Now `src/db/rows.ts`.

## Two things I wrote and never used

`shanghaiInReach` and `rewindDrillToAttempt`, both added earlier in this phase and
never wired to anything. The second is the more interesting deletion: every other
mode has a rewind, so writing one for drills felt like consistency — but the drill
screen offers Undo and no correction dialogue, so the function was capability
nobody had asked for. It is twenty lines and can come back with its consumer.

## What was deliberately left alone

The catalogue's `status: "specified"` field and the availability map's
`coming_soon` states are not dead. They describe things that are genuinely not
built, and deleting the vocabulary for "not built yet" is how a product starts
claiming it is finished.

## Verified receipts — 2026-07-31

- TypeScript clean, ESLint clean at `--max-warnings=0`, **547 tests across 44
  files — identical to before the sweep**. Build green.
