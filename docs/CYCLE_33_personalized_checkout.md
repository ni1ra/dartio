# Cycle 33 — Personalized Checkout Intelligence

Status: closed 2026-08-13 on exact-SHA Production evidence.

Dartio already calculates professional checkout alternatives and setup visits
behind the server-authorized Pro boundary. This cycle lets a player explicitly
ask that planner to rank routes from their own observed match evidence without
sending match rows to the browser or pretending that a landing reveals what
they aimed at.

## Contract

- Personalization is off by default and the choice is local to the current
  match. Pro access alone never reads history; reload returns the choice to off.
- The browser sends only the live position and `personalize: boolean`. It cannot
  submit preferred beds, plan claims, user ids, match ids, or raw evidence.
- The server resolves identity and access once, then reads at most the latest 50
  completed rows owned by that seat. Other players' visits and non-X01 modes do
  not become preference evidence.
- Only complete, physically valid dart chronologies whose non-bust score delta
  agrees with their stored darts count. Aggregate, partial, impossible, and
  contradictory visits remain outside the profile.
- A finishing double or treble bed must recur at least three times. Treble
  preferences additionally require at least 45 exact darts and nine observed
  treble hits. No missing bull is ever converted into an `avoidBull` claim.
- The response returns only the advice plus aggregate status and counts:
  `off`, `sparse`, `applied`, or `unavailable`; X01 match count; exact darts;
  and observed finishing doubles. No record, timestamp, opponent, score line,
  or dart list leaves the server.
- Sparse or unavailable history leaves the standard Pro route intact and says
  so. Free play keeps its immediate local basic route and never calls the paid
  endpoint.
- Owned history follows seat zero. A local opponent and the Navigator always
  receive standard Pro routes, even if the owner has enabled personalization.

## Queue

- [x] Freeze and test the bounded server profile, exact-evidence rules,
  thresholds, stable ranking, and no-bull inference boundary.
- [x] Replace client-supplied preferences with explicit consent and a strict
  aggregate receipt across route and client boundaries.
- [x] Add the opt-in control, applied/sparse/unavailable truth states, owner-seat
  scoping, and session-local reset to the X01 checkout companion.
- [x] Pass type, lint, unit, build, focused three-viewport browser, visual QA,
  and the full local browser matrix on the stacked branch.
- [x] Pass exact-head Preview and CI on the stacked branch.
- [x] Rebase or retarget only after Cycle 32 lands without changing the verified
  tree; merge and repeat the canonical Production verifier/browser ladder.
- [x] Archive the cycle and check the Phase 4 item only after exact-SHA
  Production evidence.

## Safety and scope

This is ranking evidence, not an accuracy model. It does not store a new player
profile, infer intent, expose history to another seat, add a tracking cookie,
change Free checkout, or make the server referee match rules. Existing history
is read-only and no schema or migration is needed.

## Receipts

Planning baseline, 2026-08-13:

- The branch was rebased after Cycle 32 landed and now has main merge commit
  `d1765d83b6d1d61ef343df257207069cf500f418` as its exact parent.
- The pre-cycle API accepted client-authored `preferredDoubles`,
  `preferredTrebles`, and `avoidBull`. The new strict body rejects those fields.
- The existing checkout domain already proves D16 can change 80 from `T20 D10`
  to `T16 D16` and can change a 169 setup leave from 40 to 32. Cycle 33 makes
  those preferences server-owned rather than adding a second route engine.
- Typecheck and full lint exited 0 on the final candidate. Full Vitest passed 64
  files and 988 tests with only the existing opt-in live rollback proof skipped.
- The final focused production-build browser run passed 12/12 across 390x844,
  834x1112, and 1440x1000. Its four stories prove an applied owner profile,
  sparse evidence, history unavailability with the standard Pro route intact,
  and a Free player making no advice request.
- The first focused browser candidate passed 8/9; its only failure was a mobile
  visibility assertion that contradicted the established attached-but-collapsed
  companion contract. The assertion was corrected, and the final 12/12 matrix
  passed without a product-code workaround.
- Visual inspection of the final applied state at mobile and desktop found no
  clipping or horizontal overflow, and kept the opt-in state, evidence receipt,
  and `169 -> leave 32` advice readable in one panel.
- The final full browser run completed with Playwright status `passed` and no
  failed test ids. Static discovery contains 363 checks; four are the existing
  designed skips, yielding 359 executed passes and four skips.

Release closure, 2026-08-13:

- PR #38 passed exact-head CI run `31653381593` and Vercel Preview, then merged
  as `a7bcbc87bb2ceb30a7c3038ee75dd72ec8cea758`. Main CI run `31654001803`
  passed, and Production deployment `dpl_3tJVGWGXgjgqt1WWFhgo4sZpReLc` was
  READY with that exact SHA and the canonical alias.
- The later cumulative Cycle 34 Production bundle passed authenticated history,
  the paid AI boundary, the paid voice boundary, and all 374 runnable checks in
  the canonical three-viewport browser matrix. The personalized advice stories
  remained green on that deployed bundle.
