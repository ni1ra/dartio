# Cycle 8 — The Round-Based Modes

Status: closed 2026-07-28

Derived from: `PHASE_1_v1_foundation.md` and gap 3 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Ship Around the Clock, Shanghai, Count-Up, and Bob's 27 as real games.
- [x] Prove the mode architecture holds by adding four modes as a table, not four reducers.
- [x] Give every round mode the shared board, pad, keyboard, correction, and resume.
- [ ] Ship Checkout Lab, Doubles Matrix, and Scoring Sprint.

## Verified receipts — 2026-07-28

- **Four modes, one reducer.** `src/domain/round-modes.ts` holds one skeleton —
  a sequence of rounds, three darts a visit, a target that depends on the round
  — and a `RoundRules` entry per mode saying how a visit scores and when the
  game ends. Around the Clock walks 1 to 20 then the bull, advancing on any bed
  and more than once per visit. Shanghai targets the round number, scores face
  value, and a single-double-treble in one visit wins outright. Count-Up counts
  everything for eight rounds. Bob's 27 starts on 27, pays twice the number for
  each double, subtracts twice the number for a visit that misses all three, and
  eliminates below zero. Adding the fifth is a table entry.
- **The scoreboard tells the truth mid-visit.** The reducer banks a visit only
  when it settles, which is right — a visit is the unit these modes score in —
  but a player needs the target to move as they hit it. `liveRoundView` projects
  the in-progress visit without committing it. Bob's 27 is excluded from the
  projection when it would show a deduction, because a visit that has missed one
  double can still be saved by the next two, and showing the penalty early would
  be a lie about a live visit.
- **The architecture claim held again.** `round-modes.ts` imports nothing from
  X01 or Cricket, `round-log.ts` is the same event-log contract a third time,
  and `RoundMatch` is a single screen that reads a target and some totals and
  never branches on which mode it is showing.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 361 unit
  tests across 28 files (from 346), production build. Browser proof: 102 tests
  across the three viewports, all passing, including five new — the practice
  catalogue linking every playable mode, Around the Clock advancing its target,
  Shanghai ignoring everything but the round's number, Count-Up counting
  everything while Bob's 27 opens on 27, and a round mode resuming after reload.
- The practice catalogue now links five modes and `GAME_MODES` marks them
  `playable`. Four rows still read "COMING NEXT", and they are the honest four.

## Open

- **Checkout Lab, Doubles Matrix, and Scoring Sprint are not built.** They are
  drills rather than games — a target generator, an attempt ledger, and a
  progress record — which is a different shape from the round skeleton and a
  different shape from each other. Scoping them onto this cycle would have meant
  a rushed version of three things instead of a finished version of four.
  They carry to Cycle 10 with the practice progress surface they need anyway.
- No round mode has an AI opponent or a voice vocabulary yet, for the same
  reasons recorded against Cricket.
