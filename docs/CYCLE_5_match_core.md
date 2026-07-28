# Cycle 5 — The Match Is a Log

Status: active

Derived from: `PHASE_1_v1_foundation.md`, the deterministic-correction and
active-match-resume rows carried forward from Cycle 2, and gaps 4, 7, and 14 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Make what was thrown the canonical record, and derive state from it.
- [x] Route every input surface — board, keypad, voice, AI — through that one path.
- [x] Let a player correct a visit from earlier in the leg, not only the latest dart.
- [x] Survive a reload without losing the match.
- [x] Report regulation statistics beyond the three-dart average.
- [ ] Persist completed matches to Neon for signed-in players.

## Verified receipts — 2026-07-28

- **`src/domain/x01-log.ts` makes the log the match.** An `X01Event` is a dart or
  an aggregate visit; `replay` folds the existing pure reducers over the log from
  a fresh match. The same log always produces the same state, which is what makes
  correction, resume, and replay possible at all — a snapshot stack can undo, but
  it cannot answer "what if that dart two visits ago had been a treble".
- **Rewind, not excise.** The first implementation removed a visit from the middle
  of the log. A browser test caught what that actually does: events record *what*
  was thrown and turn order decides *who* threw it, so cutting one visit out
  hands every later visit to the wrong player — player one's 321 silently became
  the opponent's. `rewindToVisit` truncates to just before the chosen visit
  instead: everything before it stands, everything after is thrown again.
  `replaceVisit` is available for in-place substitution where turn order must be
  preserved exactly.
- **Refused events are reported, not dropped.** `replay` returns the events the
  rules rejected along with the state. A correction that turns a legal finish
  into an impossible one leaves the player on the score they were actually on,
  with the reason available rather than a silent discrepancy.
- **The AI throws through the log too.** `localAiDarts` returns darts rather than
  a state, and the premium endpoint's visit is appended as events. A resumed or
  corrected match replays the opponent's throws exactly as it replays the
  player's; the local seed derives from the completed-visit count, so the same
  log produces the same AI visit every time.
- **A reload resumes the match.** `src/lib/product/match-store.ts` writes the
  serialized log to local storage on every event and reads it a frame after
  mount, so the first client render still matches the server's. Resume requires
  no account, because free play requires no account. A stored log whose options
  or players differ from the match being set up is ignored rather than
  half-applied. `src/domain/x01-persistence.ts` versions the format and validates
  it with zod on read: an unknown version, an impossible bed, or an unexpected
  key is discarded, because resuming into a subtly wrong score is worse than
  starting again.
- **Regulation statistics.** `x01PlayerStats` now reports first-nine average
  (the opening three visits of each leg, taken before the checkout phase distorts
  it), checkout attempts and percentage counted from *arriving* on a finishable
  score rather than from happening to win, bust count, best visit, and legs won.
  All read zero rather than undefined before anything is thrown.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 330 unit
  tests across 26 files (from 315), production build.
- Browser proof: 63 tests across the three viewports, all passing, including
  three new ones that drive the interface — a reload resuming a match with its
  history intact, a rewind reaching two visits back and dropping six entries, and
  a match with different settings correctly refusing to resume the stored one.

## Open

- **Completed matches are not written to Neon.** `matches`, `players`, `turns`,
  and `darts` still have no writer, so a signed-in player's history does not
  survive the device — gap 5 of the audit is only half closed. The log format is
  now the natural thing to persist, so this belongs with the account surfaces in
  Cycle 10 rather than as a tail on this cycle.
- The account hub still shows membership only.
