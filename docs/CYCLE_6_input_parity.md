# Cycle 6 — Input Parity and Accessibility

Status: active

Derived from: `PHASE_1_v1_foundation.md` and the accessible keyboard/touch
alternatives row, plus the stale-copy finding in gap 6 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Score a whole leg from the keyboard without reaching for the pointer.
- [x] Announce what the keyboard did to assistive technology.
- [x] Honour `prefers-reduced-motion` across the product, not per component.
- [x] Stop the friends page advertising a cycle that closed and features that do not exist.

## Verified receipts — 2026-07-28

- **The recon's claim about incomplete input was already stale**, and the audit
  corrected it: the per-dart pad has offered singles, doubles, and trebles for
  1–20 plus SB, DB, and MISS at 44 px since the entitled-continuity work. What
  was genuinely missing was speed. Sixty-three buttons is technically accessible
  and practically unusable at one tab-stop per dart, so scoring now has a real
  scheme: type the number, then choose the bed. `1`–`9` and `0` build the
  segment, `Enter` records a single, `d` a double, `t` a treble, `b` and `B` the
  bulls, `m` a miss, `Backspace` undoes, `Escape` clears.
- **It stays out of the way of forms.** The handler ignores events from inputs,
  selects, textareas, and contenteditable regions, so typing a room code is
  never captured as a dart — proven by a browser test that types `OCHE20` into
  the join field and reads it back intact.
- **Half-typed input cannot leak across a turn.** The buffer clears when the
  surface disables, adjusted during render rather than in an effect so the stale
  digits never reach the DOM.
- **Every keyboard action is announced** through a polite, atomic live region,
  and the typed digits are shown in the dock with the three keys that turn them
  into a dart — present only while something is buffered, so the scheme teaches
  itself at the moment it is useful.
- **Reduced motion is honoured globally** rather than component by component.
  Everything animated in this product is decorative; none of it carries meaning
  a still frame does not.
- **`/friends` stopped overselling.** The host button read "coming in Cycle 2"
  while Cycle 2 was closed, and the page listed server-authoritative matches,
  reconnect, and spectator history as though they existed. They are now labelled
  as planned, and the button says hosting is not open.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 330 unit
  tests, production build. Browser proof: 75 tests across the three viewports,
  all passing, including four new keyboard tests — a full visit scored from the
  keyboard alone, bulls and misses and backspace-undo, the buffer readout and
  its escape, and form fields staying untouched.

## Open

- Voice and AI already share the canonical event path from Cycle 5; a mode with
  its own input surface will need the same treatment when Cricket lands.
