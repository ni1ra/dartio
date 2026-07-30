# Cycle 18 — Continuous Voice

Status: active

"Always-on" recorded one 4.5-second clip whether or not anybody spoke, transcribed
it, and then waited to be asked again. It was a single clip with extra steps.
`confirm` and `cancel` were parsed and dropped on the floor, because there was
nothing to confirm — every clip was applied the moment it was understood.

## A clip is a sentence, not a stopwatch

`src/lib/voice/segmenter.ts` turns a stream of loudness readings into clips worth
sending: it knows when somebody started talking and when they stopped. It is
deliberately pure — a number and a timestamp in, a decision out — because the
alternative is logic that can only be exercised with a microphone, and
microphone-only logic is logic nobody tests. Ten tests cover it.

Three of its decisions are worth naming:

- **A clip ends where the talking stopped, not where the silence was noticed.**
  Otherwise every clip carries the pause that closed it, and the transcriber is
  paid to listen to nothing.
- **A pause shorter than the silence window does not split a clip.** "Treble…
  twenty" is one thing somebody said.
- **Speech shorter than 180 ms is thrown away without a word.** That is mostly
  darts hitting the board, which is loud and over instantly. Always-on then goes
  straight back to listening — stopping to be restarted after every noise in the
  room is precisely what made the old mode unusable.

The monitor runs on animation frames rather than a timer, so it stops when the tab
is hidden. A phone on a stool with the screen off should not be holding a
microphone open and sending audio.

## Words that now mean something

`src/lib/voice/dialogue.ts` gives `confirm` and `cancel` something to act on, and
gives each mode its own vocabulary.

- A doubtful transcription is **held** rather than scored, and answered oldest
  first — so two doubts do not resolve backwards.
- Saying "yes" with nothing pending now says so, rather than being silently
  discarded.
- **A visit total is X01's alone.** Cricket scores marks on specific beds, the
  round modes score specific targets, a drill scores an attempt: in none of them
  does "score sixty" name anything, so it is refused rather than half-understood.
  A drill has nobody to pass to, so "next player" is refused there too. A dart is
  legal everywhere, because every mode is thrown at the same board.

Always-on applies what it understood and returns to listening. A misheard dart is
corrected by saying "undo", which is in the vocabulary of every mode.

## What is honestly not here

The confidence floor that decides *held* versus *applied* is implemented and
tested, but the transcription route does not yet return a confidence, so nothing
currently reaches the queue in production. The plumbing is real and the queue is
exercised by tests; the signal that feeds it is the remaining work, and it is not
claimed anywhere in the interface.

## Verified receipts — 2026-07-31

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **535 tests across 42 files**, up from 513 across 40. Build green.
- 22 of the new tests are the segmenter and the dialogue, neither of which needs a
  microphone to run.
