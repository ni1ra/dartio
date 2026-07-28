# Cycle 4 — Interface Revamp and Repeatable Browser Proof

Status: active

Derived from: `PHASE_1_v1_foundation.md` and gaps 1, 2, 10, 11, 12, 13, and 15 of
`artifacts/GAP_AUDIT_2026-07-28.md`.

## Slice

- [x] Stop a third-party reset from flattening the component system.
- [x] Make a leg playable on a phone without scrolling to reach the input.
- [x] Give the scoring controls real width on desktop.
- [x] Stop the checkout companion reporting the ordinary scoring phase as a failure.
- [x] Load fonts without blocking first paint on a third-party stylesheet.
- [x] Delete the theme definitions that never applied.
- [x] Put the viewport, geometry, theme, and entitlement proofs into a suite anyone can re-run.
- [x] Run the browser proof in CI and keep its evidence on failure.

## Verified receipts — 2026-07-28

- **One cascade defect was flattening every control in the product.**
  `@neondatabase/auth/ui/css` ships a Tailwind Preflight reset whose universal
  rules are unlayered, while Navi UI puts everything in `@layer navi.*` —
  and unlayered CSS beats layered CSS at any specificity. Measured on `/play`
  before the fix: `.navi-segmented` had `border-width: 0px` against a
  near-canvas background, and **both** options computed to
  `color: rgb(247, 247, 244)` with transparent backgrounds, so "Who are you
  playing?" rendered as the flat run-on text "Dartio AI Local Friend". Neon's
  stylesheet now loads from `src/app/auth/layout.tsx`, scoping it to the only
  segment that renders Neon's own UI. After: container border `1px solid
  rgb(43, 46, 53)`, selected option `rgb(25, 28, 34)` against an unselected
  `rgb(167, 169, 176)`. Buttons, selects, tabs, surfaces, and the theme
  switcher all recovered their intended treatment from the same change, and the
  Neon sign-in form keeps the reset it was built against — its primary button
  measured `lab(98.26)` on `lab(7.78)` after the move.
- **A leg now fits a phone.** At 390×844 the scoring pad began at y=969 — below
  the fold — so a player scrolled down to score and back up to read the score,
  every visit. The scoreboard is now sticky, the board yields its space when it
  is not the active input, and the checkout companion collapses to the state,
  the number, and the route. The pad now begins at **y=732** — inside the 844 px
  first screen — so a visit can be scored without scrolling at all. Both
  measurements were taken after the cascade fix, so they compare the layout
  change alone: y=969 before, y=732 after, with total match height falling from
  2145 px to 1906 px in keypad mode and from 2009 px to 1771 px in board mode.
- **Desktop proportions rebalanced** from `minmax(380px,1.3fr) minmax(340px,.7fr)
  310px` to `minmax(340px,1fr) minmax(390px,.82fr) minmax(240px,.46fr)`, so the
  panel a player reads every visit is no longer the narrowest column.
- **Checkout copy corrected at the source.** 501 with three darts in hand printed
  "No valid 3-dart route is available from 501." Being above the finishing range
  is the scoring phase, not a missing route: `basicCheckoutAdvice` now returns
  `scoring-setup` with "Scoring phase. 501 is above the 3-dart finishing range —
  build the score down." A finishable score with genuinely no route still says
  so, and a bogey is still named a bogey; both are covered by tests. The
  duplicate empty-state paragraph that repeated the same idea in different words
  was removed.
- **Fonts self-hosted through `next/font`.** `globals.css` opened with an
  `@import` of `fonts.googleapis.com` for three families, serializing a
  third-party stylesheet ahead of first paint on a product that promises twelve
  seconds to first dart. Manrope, Syne, and DM Mono are now bundled with
  `display: swap`, and the 92 literal font names in the stylesheet became three
  variables.
- **Dead theme CSS removed.** The silver and blood token sets were defined twice,
  under `[data-theme]` and under `[data-navi-theme]`. `NaviProvider` stamps
  `data-navi-theme`; `document.querySelector('[data-theme]')` returned null, so
  the first copy never applied and editing it produced no visible change. The
  four dead rules are gone and `:root` still carries the black default.
- **The browser proof is now a suite.** `tests/browser/` runs 18 tests across
  mobile (390×844), tablet (834×1112), and desktop (1440×1000) — 54 in total,
  all passing. It covers: every public route loading without horizontal overflow
  or a console error; keyboard focus drawing a visible ring on every control it
  reaches; one square in-bounds board with 80 scoring beds and 20 numerals; a
  physical click on the treble-twenty path scoring 60 and leaving 441; black,
  silver, and blood each keeping match text above a 3:1 contrast floor; the
  segmented control keeping a distinguishable selected state; and a signed-out
  player scoring a visit while the paid surfaces stay honestly locked. Point
  `DARTIO_BASE_URL` at a preview or production deployment to run the same suite
  against a real environment.
- **The contrast check found a bug in itself first.** Its initial version read
  `color(srgb 0.98 0.98 0.99)` as a 0–255 triple and reported a white panel as
  black. Colours now resolve through a 1×1 canvas and semi-transparent layers
  composite in paint order, so the number means the same thing whatever colour
  syntax produced it.
- CI gained an install-browser step, the browser proof with placeholder
  environment values that reach no real service, and an artifact upload that
  keeps the Playwright report and traces for seven days when it fails.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 315 unit
  tests across 25 files, production build, and 54/54 browser tests.
- The regulation dartboard renderer, SVG geometry, board selectors, and
  coordinate contract were not changed. The board is now asserted by test rather
  than by remembering to look.

## Found while building the harness

- **`/api/auth/get-session` answers 500 when Neon Auth's upstream is
  unreachable.** Running the suite against an environment whose auth base URL
  does not resolve produced a 500 on every page that reads the session — pricing,
  account, and sign-in. Dartio's own routes return a deliberate 503 in the same
  situation, which is what lets the client keep local free play alive; this one
  reports a server fault instead. It is not a regression from this cycle and it
  is not reachable with correct configuration, but a real Neon outage would hit
  it. Recorded for Cycle 10 alongside the rest of the observability work.
- **A clean install of the repository was broken.** With three esbuild majors in
  the store, 0.28's postinstall re-runs `esbuild --version`, resolves the wrong
  binary, and fails the whole install with "Expected 0.28.1 but got 0.25.12".
  CI had never hit it because the lockfile it was given happened to avoid the
  path. The self-check is disabled in `pnpm-workspace.yaml`; the binary it
  validates ships prebuilt in the platform package and needs no build step.

## Open

- The mobile match is still taller than one screen in board mode; the board is
  the input there, so the score and the board share the first screen and the
  panels below are reference. Revisit if a player reports reaching for them.
- Visit history remains a thin column on desktop with a decorative empty state.
- `globals.css` is 55 KB of minified single-line rules. Now that Navi's
  components render as intended, a large part of it is re-implementing what the
  library already provides. Reducing it is its own slice, not a tail on this one.
