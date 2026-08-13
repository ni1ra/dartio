# Cycle 34 — Custom Practice

Status: closed 2026-08-13 on exact-SHA Production evidence.

Dartio already has nine deliberately fixed games and drills. This cycle turns
the separate custom-practice entitlement into one small, understandable Pro
tool: choose an ordered path of physical scoring beds, get up to three darts at
each, and move on at the first exact hit. It does not introduce a generic rules
language or make the fixed drills configurable shadows of themselves.

## Contract

- A path contains 1–12 exact physical beds: S1–S20, D1–D20, T1–T20, SB, or DB.
  The canonical URL identity uses the same notation and refuses aliases,
  impossible beds, extra fields, and oversized paths.
- Each target settles on the first exact hit or after three misses. Domain
  state, event replay, undo, completion, and summary are pure and deterministic.
- The builder and direct scoring route both require the implemented
  `custom_practice` Pro entitlement. Free players keep every fixed practice
  mode and cannot turn a copied custom URL into a scoring bypass.
- Active progress uses one strict, path-scoped, versioned local envelope.
  Current corruption is removed once; unknown storage, rules, or log versions
  remain byte-for-byte untouched; storage denial never blocks scoring; and a
  deliberate undo-to-empty cannot resurrect discarded darts after reload.
- Completion files one ordinary owner-seat `MatchRecord` under mode
  `customPractice`, with exact darts, targets, hit count, and no invented
  winner. Statistics count it as an unscored practice session, while the three
  fixed drill progress cards remain their own truthful series.
- The surface reuses the regulation board, keypad, keyboard input, screen wake
  lock, and the shared confidence/FIFO voice controller. Completion, undo,
  access loss, navigation, and revision changes keep the established stale-work
  boundaries.
- Invalid custom URLs render the product's 404 boundary before any scoring
  surface. No database table, migration, server-side custom-rules store, or
  public share directory is added.

## Queue

- [x] Freeze the bounded target grammar, deterministic attempt rules, event
  log, replay, undo, summary, and match-record identity.
- [x] Add strict versioned resume with path scoping, future-version
  preservation, corrupt cleanup, optional-storage containment, and explicit
  empty-transition cleanup.
- [x] Add the Pro builder and direct route, then integrate board, keypad,
  keyboard, voice, wake lock, completion filing, and truthful Free refusal.
- [x] Update availability, pricing, account membership, history labels, and
  statistics classification without changing the fixed drill cards.
- [x] Pass focused unit/type/lint/browser gates and mobile/desktop visual QA.
- [x] Pass the final full local unit/build/browser matrix, rebase over merged
  Cycle 33, then repeat TypeScript and the focused contract suite.
- [x] Pass exact-head Preview and CI, merge, repeat the canonical Production
  verifier/browser ladder, and archive the cycle.

## Safety and scope

Custom paths contain board targets, not private identity, biometric data, or a
new behavioral profile. Resume stays in the current browser; signed-in history
receives the same bounded match record as other local modes. This cycle does not
add user-authored code, arbitrary expressions, remote path discovery, social
sharing, a second statistics system, or a database migration.

## Receipts

Local candidate, 2026-08-13:

- The branch was initially stacked on the Cycle 33 candidate, then rebased
  directly onto Cycle 33 merge commit
  `a7bcbc87bb2ceb30a7c3038ee75dd72ec8cea758`. The superseded pre-merge Cycle
  33 commit was skipped rather than replayed a second time.
- The focused final domain/store/access/statistics suite passed 7 files and
  127 tests. TypeScript and scoped ESLint both exited 0.
- The first browser candidate passed 3/12: the failures exposed two test-fixture
  mistakes, not product exceptions—the builder test had not changed the target
  number, and App Router streamed its shell before the rendered 404 boundary.
  After correcting those proofs, the next run passed 9/12; its only remaining
  issue was a strict locator matching both established Undo controls.
- The final focused production-build matrix passed 15/15 across 390x844,
  834x1112, and 1440x1000. It proves builder-to-completion filing, exact resume
  plus undo-to-empty, Pro hydration preserving a future envelope, Free builder
  and direct-route refusal, and malformed-path refusal.
- Actual Chromium screenshots at 390 and 1440 widths were inspected after the
  final run. The builder, ordered path, regulation board, keypad, voice panel,
  and command dock remain readable without clipping or horizontal overflow.
- The final pre-rebase full gate passed 67 unit files and 1,019 tests with only
  the existing opt-in live rollback proof skipped. Full lint exited 0; the
  production build completed; static browser discovery found exactly 378
  checks; and the unpiped full run passed all 374 runnable checks with the four
  established layout skips. `test-results/.last-run.json` recorded `passed`
  with no failed test ids. After the rebase, TypeScript and the same 7-file,
  127-test focused contract suite both passed again.

Release closure, 2026-08-13:

- PR #39 passed exact-head CI run `31654115432` and Vercel Preview, then merged
  as `d6a446082c6bd557f9e0ef9ff83565065b0743f9`. Main CI run `31654855115`
  passed. Production deployment `dpl_4GdoSmom4oFCBrYYGHYsx8AfsdBW` was READY,
  targeted Production, carried that exact SHA on `main`, and owned the canonical
  Dartio aliases without an alias error.
- The exact deployed bundle passed Production auth, a synthetic owned-history
  write/read/detail/statistics round trip, every anonymous room refusal plus a
  paid room open, all five level-20 AI target families, and the paid synthetic
  voice boundary. The first bounded voice run's provider variance is retained in
  the Cycle 32 receipt alongside the later pass.
- The unpiped canonical Production browser run collected 378 checks and passed
  all 374 runnable checks at 390x844, 834x1112, and 1440x1000; the remaining four
  were the established intentional layout skips.
