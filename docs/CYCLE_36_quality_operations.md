# Cycle 36 — Accessibility, Performance, and Operations

Status: closed on 2026-08-13 through PR #41 and Production evidence.

Cycle 36 measures the product players actually receive. It covers every public
entry surface and every scoring family, closes the gaps the measurement finds,
puts enforceable ceilings around the shipped landing and X01 bundles, and keeps
production diagnostics useful without turning logs into a second copy of a
player's identity or match.

## Contract

- The browser gate visits landing, setup, practice, friends, pricing, account,
  sign-in, sign-up, all six game modes, all three fixed drills, and the custom
  practice entry already covered by its own story. Every audited page has one
  main landmark, unique ids, named controls in the browser accessibility tree,
  keyboard-reachable controls, visible/unobscured focus, and no enabled
  non-inline target below WCAG 2.2's 24 CSS-pixel AA floor.
- Reduced-motion preference leaves no decorative animation running. It does not
  disable explicit player actions.
- The measured Production baseline becomes a regression budget, not a synthetic
  Lighthouse score. Transfer bytes, JavaScript, CSS, request count, and DOM size
  are asserted on landing and X01 at 390x844, 834x1112, and 1440x1000.
- Operational events remain one bounded JSON object on stdout/stderr for Vercel
  Runtime Logs. The allow-list has no user id, email, token, cookie, room code,
  transcript, match payload, provider body, error name, or error message.
  Failures retain only event, route/status/count/mode where explicitly supplied,
  and a fixed category: abort, syntax, type, error, or unknown.
- No analytics SDK, error collector, replay agent, cookie, fingerprint, or new
  third-party request is added. Logs observe existing events and decide nothing.

## Measured baseline and budgets

The pre-Cycle-36 canonical Production bundle was measured in a new browser
context on 2026-08-13. The largest observation across the three configured
viewports was:

| Surface | Transfer | JavaScript | CSS | Resources | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Landing baseline | 674,033 B | 530,428 B | 75,332 B | 54 | 375 |
| X01 baseline | 713,241 B | 569,077 B | 75,332 B | 58 | 327 |
| Landing ceiling | 760,000 B | 600,000 B | 120,000 B | 65 | 425 |
| X01 ceiling | 800,000 B | 650,000 B | 120,000 B | 70 | 375 |

The ceilings leave roughly 12–20% delivery headroom while still failing a
meaningful new client dependency, duplicated stylesheet, request fan-out, or DOM
explosion. CSS allows the local Next server's 107,514-byte uncompressed delivery
as well as Production's 75,332-byte compressed transfer. Timing percentiles are
deliberately not pinned to a local/CI runner; the deterministic delivered-work
budgets are what this gate can compare fairly.

## Findings closed

- The setup AI-level range was 16 CSS pixels high. It now owns a 24-pixel target
  without changing the slider's value or visual scale.
- Neon Auth's Forgot-password link measured 20 pixels high. Dartio gives that
  provider-owned inline action a 24-pixel box.
- Neon Auth's disabled password-visibility button appeared as an unnamed button
  in the computed accessibility tree. The existing pinned package patch now
  supplies dynamic “Show password” / “Hide password” names; the lockfile binds
  the exact patch hash.
- Visual QA then caught Neon Auth's heading and field labels inheriting dark
  provider text on Dartio's dark card. The auth boundary now pins those text and
  link colors to the theme's measured foreground rather than relying on a
  provider default.
- The computed contrast gate caught white labels on the original bright orange
  fill at 3.20:1, plus the pricing interval's orange saving label on a light
  selected tab at 2.86:1. Bright orange remains the signal color; text-bearing
  fills now use a darker theme companion and the selected saving label inherits
  the selected tab's foreground. The final three-viewport contrast sweep is
  clean.
- The first exact-head Preview sweep exposed one environment-only gap the local
  fail-closed auth state could not render: the voice-access `Sign in` action
  measured 4.22:1 on every anonymous scoring surface. A later shared access rule
  had replaced the primary button's white label with the softer ink token. The
  solid-fill rule now restores its explicit on-accent foreground.
- Failure logging previously included user ids plus arbitrary `Error.name` and
  `Error.message`. Tests reproduced that leak with sentinel values. Identity
  and raw causes are now impossible fields at the runtime allow-list.

## Queue

- [x] Measure all public and scoring surfaces at the three release viewports.
- [x] Close the measured target-size and accessible-name gaps.
- [x] Add computed accessibility-tree, id, target, keyboard, focus, and
  reduced-motion assertions.
- [x] Measure and enforce landing/X01 delivery and DOM budgets.
- [x] Remove identity and raw exception content from operational events while
  preserving fixed diagnostic categories.
- [x] Pass the final local type/lint/unit/build/full-browser ladder and visual QA.
- [x] Pass exact-head Preview and CI, merge, then repeat the canonical
  Production auth/history/rooms/AI/voice/full-browser and runtime-log audit.

## Evidence sources

- WCAG 2.2, including Success Criterion 2.5.8 Target Size (Minimum):
  https://www.w3.org/TR/WCAG22/
- Vercel Runtime Logs, the platform sink used by this repository:
  https://vercel.com/docs/logs/runtime

## Receipts

Pre-fix audit, 2026-08-13:

- The first 54-check browser sweep passed 45 and failed nine: the same three
  concrete defects above at 390, 834, and 1440 pixels. Every other audited
  surface passed landmarks, computed names, unique ids, target size, and
  reduced-motion checks.
- Production transfer measurements were collected six times (two surfaces by
  three viewports) and produced the maxima recorded in the budget table.
- The existing server logger was re-read at every call site. It had no
  third-party exporter, but the allow-list included `userId` and `reason`,
  and `recordFailure` copied arbitrary exception name/message into the line.

Candidate gate, 2026-08-13:

- The final focused production-build matrix passed 60/60 across 390x844,
  834x1112, and 1440x1000. It audited 17 entry/scoring surfaces for computed
  accessible names, unique ids, keyboard reachability, actual focus traversal,
  unobscured visible focus, WCAG 2.2 target size, computed text contrast,
  reduced motion, and the landing/X01 delivery budgets.
- The run rebuilt the final candidate. Local auth requests were expected to fail
  closed because this worktree carries no Neon credentials; the UI assertions
  and all 60 quality checks still passed.
- Full TypeScript and full ESLint passed. Full Vitest passed 69 files and 1,035
  tests with only the established opt-in live rollback proof skipped.
- The first full unit attempt exposed one stale auth-proxy assertion that still
  required a raw `ECONNREFUSED` cause in the runtime log. The product was already
  fail-closed; the test was corrected to require the fixed `failure: "error"`
  category and to prove the raw cause/address are absent. The focused boundary
  then passed 16/16 before the full green rerun.
- The final local browser matrix rebuilt the candidate and passed 455/459; the
  remaining four are the established, deliberate layout skips. This includes
  the 60 new quality checks alongside every existing scoring, billing, AI,
  voice, room, history, replay, and resilience story.
- Final visual inspection of the rebuilt sign-up surface at 834x1112 confirmed
  readable provider heading/labels/controls, an intact responsive split, and no
  clipping or horizontal overflow. The temporary server was stopped afterward
  and port 3100 was free.
- PR #41's first exact-head Preview was READY at
  `https://dartio-2re9neiko-niras-projects-868b6f5f.vercel.app` for
  `2c4f4359271502b0b5e8811593f76c3843c43b04`. Its focused quality run passed
  33/60 and failed the same signed-out `Sign in` contrast assertion on all nine
  scoring surfaces at all three widths: 4.22:1 against the required 4.5:1. All
  other public surfaces, reduced-motion checks, and delivery budgets passed.
  The failure is retained as the reason for the final account-link correction.
- A first attempted correction targeted the same-named header account link and
  passed locally because the credential-free build rendered the fail-closed
  voice state. The next exact-head Preview proved the issue remained 33/60 and
  exposed both computed elements directly; that attempt was reverted rather
  than retained as unrelated visual churn.
- The quality story now fixes anonymous session/access responses for scoring
  pages, so local, CI, and deployed runs render the same visitor-only voice
  action. With the correct on-accent foreground, a clean production build passed
  60/60 at all three widths; TypeScript and focused ESLint passed first.
- Exact-head `ceab9be74f548d557615351a5a0e14ee9a5d4ef8` passed CI run
  `31662089480` and deployed READY at immutable Preview
  `https://dartio-af1n95762-niras-projects-868b6f5f.vercel.app`. The deployed
  quality matrix passed 60/60, including the nine anonymous voice actions that
  had exposed the earlier contrast defect.
- The first full deployed matrix then passed 454 checks with four intentional
  skips and timed out only while one completed page reload waited for global
  `networkidle`. Its trace showed the Dartio document had navigated and all
  storage assertions had already passed; background traffic from Preview's
  Vercel Live frame kept the unrelated global idle condition open. The three
  persistence reload stories now wait for document readiness and retain their
  exact post-reload state assertions. The minimized correction passed 9/9 over
  all three viewports.
- The next exact-head Preview again passed the focused quality matrix 60/60 and
  CI run `31663839312`, then reproduced the same global-idle dependency in two
  mocked replay routes after 453 successful checks and four intentional skips.
  Every replay navigation now waits only for the document and proves readiness
  through its own visible data/state assertions. The combined replay and
  resilience regression passed 69/69 across 390x844, 834x1112, and 1440x1000.
- Exact-head `14da43b211ae0638307c6e9f8f965b4adaea7df4` passed the focused
  Preview quality matrix 60/60. Its full Preview matrix moved the same timeout
  again, this time to the generic pricing route after 454 successful checks and
  four intentional skips. Three different routes failing only while waiting
  for global `networkidle` established a harness-wide dependency on unrelated
  Preview traffic rather than a Dartio route defect.
- Replacing global idle with `DOMContentLoaded` alone reproduced a real
  hydration race locally: the App Router's hidden streamed segment briefly
  coexisted with its visible replacement, so tests saw duplicate controls or
  sent input before client listeners mounted. The shared browser navigation
  boundary now waits for React's stream placeholder and hidden transport
  segment to leave the document, then yields two animation frames. It never
  waits for background deployment traffic.
- The minimized dartboard reproduction passed 9/9 after that correction. The
  complete set of stories affected by the earlier race passed 237/237 across
  all three viewports. The final production-build browser matrix then passed
  455/459 with only the four established layout skips. TypeScript, scoped
  browser ESLint, the full 69-file / 1,035-test unit matrix, and diff checks
  passed; the one opt-in live rollback proof remained deliberately skipped.
- Exact-head `61139876f2d6cae4d463b65662434d2441a41f0b` deployed READY at
  `https://dartio-6imvsh8fz-niras-projects-868b6f5f.vercel.app`. Its first
  focused quality sweep passed 34 checks and failed 26 because the audit ran
  while the intentionally hidden account-navigation placeholder was still
  resolving session authority. The visible document and every product control
  were already ready; only the hidden placeholder's low-contrast loading copy
  was being measured.
- The quality boundary now waits for that explicit account-navigation loading
  state to leave the document before computing accessibility properties. A
  clean rerun against the same immutable deployment passed 60/60 across all
  three release viewports.
- Exact-head `16c5752abbad1607ab6bde7d9bdbd2851b2da57e` passed CI run
  `31667104076` and deployed READY at immutable Preview
  `https://dartio-nuoeetbhn-niras-projects-868b6f5f.vercel.app`. Its focused
  quality matrix passed 60/60.
- The first full run there passed 452 checks with the four established skips
  and exposed three test-boundary races. Vercel's injected feedback toolbar
  entered the tab order outside Dartio's application root. Checkout Lab and a
  Free-AI match each received input after server markup was visible but before
  the owning client component had attached its handlers.
- The shared navigation boundary now waits for the existing client-resolved
  account navigation signal as well as the streamed-document markers. The
  focused keyboard test counts twelve Dartio-owned controls and ignores only
  external deployment tooling. All nine affected viewport/story combinations
  then passed, followed by the complete immutable-Preview matrix: 455 passed,
  four intentional skips, zero failures.

Release closure, 2026-08-13:

- Final PR head `a17fc3d4c34989c55a0dd03986c3c684df9bd77e` passed CI run
  `31668118954`, deployed READY at immutable Preview
  `https://dartio-bjf5wzjx3-niras-projects-868b6f5f.vercel.app`, and passed the
  complete 455-run / four-skip browser matrix there with zero failures.
- PR #41 merged as `e52c1f8671b728c04ed8cd556ce8bc661bf73118`.
  Main CI run `31668637443` passed typecheck, lint, unit, build, and browser
  proof. Production deployment `dpl_2C7EGdcNAEAD87SZo7Q1sWyAFmWx` is READY on
  that exact SHA, and the canonical alias resolves to it without an alias error.
- Production auth, strict owner-only history/detail/statistics, room authority,
  aggregate room integrity, paid AI, and paid voice gates all passed. The room
  audit reported zero owner, version/turn, terminal-field, and orphan-signature
  anomalies. AI returned 25 independently scored darts for each of five
  level-20 bed families; voice returned the checked T20 command with a finite,
  non-zero confidence signal.
- The complete canonical Production browser matrix passed 455 checks with the
  four established layout skips and zero failures across 390x844, 834x1112,
  and 1440x1000. A bounded deployment-scoped runtime audit found no error
  clusters; sampled request logs contained only route/status/deployment/cache
  metadata and no player identity, payload, transcript, or exception text.
