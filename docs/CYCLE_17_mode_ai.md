# Cycle 17 — Opponents for Cricket and the Round Modes

Status: active

Only X01 had an opponent. Every other mode was you against nobody, which is what
audit gap 8 meant once it was closed for X01 in Cycle 9. Cricket and the four
round modes now have one, and each brings its own idea of what to aim at.

## Where the levels genuinely differ, and where they honestly do not

The complaint the audit made about X01 was that twenty levels shared one aim
policy and differed only in how badly they threw. Avoiding that here means asking,
per mode, whether there is more than one defensible target — and saying so when
there is not.

**Cricket has real depth.** A novice works the board in printed order and never
looks at what anyone else has done. Better opponents notice that a number both
players have shut can never be scored on again, and go somewhere that still pays.
Once everything is closed they switch from closing to scoring. In tactics, where
points do not exist, there is nothing to switch to and the twenty is the answer.

**Around the Clock has one real decision, and it is not the obvious one.** Any bed
on the target advances you, so the treble buys nothing and costs most of the area.
A novice throws at it anyway because it looks like the thing to do; anybody better
throws at the big single.

**Shanghai has a real decision too.** It pays face value and is won outright by
taking the single, the double *and* the treble of the round's number in one visit.
An expert plays for that, aiming at whichever of the three it still needs, hardest
first while there are darts to spare. Everyone else chases the treble for points.

**Count-Up and Bob's 27 have exactly one right answer.** Count-Up scores
everything, so the treble twenty is correct at every level. Bob's 27 scores one
specific double, so that double is correct at every level. In those two a stronger
opponent is a steadier hand and nothing else — which is the truth about the game
rather than a shortcut, and inventing variety there would be a worse lie than the
one the audit complained about.

## Levels stop at eight, deliberately

That is exactly the free tier. Levels nine to twenty are server-authorized, and the
route that authorizes them speaks X01 — it takes a remaining score, an in-rule and
an out-rule. Extending it to Cricket would mean teaching the server Cricket's
rules, which is the one thing the architecture has been built to avoid since Cycle
12. Nine to twenty stay X01-only until that can be done without it.

## The bug this cycle was written around

X01's opponent once played whole matches by itself: it committed from a timer whose
closure was a visit old, folded over a stale log, read the stale result to decide
whose turn it was, concluded it was still its own, and re-queued forever. Both new
opponents use `use-ai-visit.ts`, which calls its callback with no arguments on
purpose — the callback must go and look at what has actually happened rather than
at what it captured. Undo and rewind move the ref with the state for the same
reason; a correction that left the ref behind would hand the opponent a log from
before it.

## Verified receipts — 2026-07-31

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **513 tests across 40 files**, up from 502 across 39. Build green.
- **9 browser checks at all three viewports** proving the thing that actually broke
  before: a Cricket opponent and a round-mode opponent each throw one visit and
  hand the board back, and the round count *stays* where it lands rather than
  running away. Solo practice is still solo when no opponent was asked for.
