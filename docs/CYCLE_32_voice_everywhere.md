# Cycle 32 — Voice at Every Scoring Surface

Status: active on `codex/cycle-32-voice-everywhere`.

Cycle 26 made voice input safe and truthful for local X01. Cycle 32 reuses that
single confidence, FIFO, capture, and stale-request controller everywhere a dart
can be scored. It does not create mode-specific microphone implementations or
pretend that a spoken visit total is meaningful outside X01.

## Contract

- Cricket, all four round modes, all three fixed drills, and an eligible room
  participant use the existing `VoiceControl`; X01 remains unchanged.
- One spoken dart has the same physical boundary everywhere: miss, S1–S20,
  D1–D20, T1–T20, S25, or D25. Common darts vocabulary may expand, but a turn
  total remains X01-only and a drill cannot synthesize another player.
- Push-to-talk still requires explicit review. Opt-in hands-free input still
  uses the measured confidence floor and FIFO queue. A later utterance cannot
  leapfrog a held one.
- Every surface binds capture to its authoritative event revision. Manual input,
  undo, rewind/correction, AI progress, room polling, turn change, completion,
  access loss, navigation, or unmount invalidates stale audio before apply.
- A room accepts voice only for a seated participant in a live match. It files
  the same exact-dart visit as board and keypad input; spectators, closed rooms,
  the opponent's turn, reconnecting state, and an in-flight visit submission do
  not accept capture.
- The deployed synthetic provider gate makes at most two entitled transcription
  attempts. It retries only a structurally valid but unexpected first sample,
  prints that first observation without transcript or confidence, and fails on
  malformed/provider/error outcomes instead of hiding them.

## Queue

- [x] Freeze and test the shared cross-mode vocabulary and mode-capability map.
- [x] Mount the shared controller in Cricket, round, drill, and eligible room
  surfaces with revision and disabled-state invariants.
- [x] Prevent room input overlap while an exact visit is being submitted.
- [x] Add deterministic browser stories for every mode family, confidence hold,
  stale revision, access failure, room eligibility, and three viewports.
- [x] Harden the live synthetic fixture with one recorded bounded retry.
- [ ] Pass unit, type, lint, build, focused browser, full browser, exact-head
  Preview and CI; merge only after Cycle 31's code base is on `main` or rebase the
  stacked branch without changing the verified tree.
- [ ] Repeat exact-SHA Production auth/history/rooms/AI/voice and the complete
  browser matrix, then archive this cycle and check the Phase 4 item.

## Safety and scope

Audio still goes only to Dartio's private route and OpenAI after an explicit Pro
access decision. No raw audio, transcript, confidence, cookie, or identity is
persisted in match history or logs. This cycle does not add a second speech
provider, change the model, tune the confidence floor from a single sample, add
voice to spectators, or broaden a room's server authority from visits to darts.

## Receipts

Planning baseline, 2026-08-13:

- The branch is stacked from Cycle 31 commit
  `84093f7a1db34e8bd094f2ee3899bbe11bed573a`; it will remain a separate PR.
- Existing local X01 proof includes push review, hands-free confidence/FIFO,
  permission-release and stale-revision races across 390, 834, and 1440 widths.
- Cycle 30 observed one valid provider sample that did not parse as T20; a later
  bounded run passed. The new gate preserves that observation rather than
  requiring a human to rerun the whole release command.
- The shared vocabulary now accepts ordinary board phrases plus `S20`/`D16`/
  `T19`, miss, inner/outer bull, tops, and the darts-specific “one eighty”. Exact
  physical validation remains in the existing strict command schema. Visit
  totals stay X01-only; synthetic next-player remains unavailable outside X01.
- Final local gates on the candidate: TypeScript passed, full ESLint passed, 63
  unit files passed with 973 tests and one opt-in live rollback test skipped, and
  the focused production build passed 36/36 voice browser checks at 390, 834,
  and 1440 widths. The four new product stories prove Cricket, round, drill, and
  atomic room scoring; additional stories prove room eligibility and that an
  access outage leaves manual non-X01 scoring active.
- Visual QA inspected Cricket at 390 and 1440 widths and Checkout Lab at 390.
  The shared panel uses the existing component tokens, remains readable without
  horizontal overflow, and compacts inside the desktop side rail.
