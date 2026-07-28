# Dartio Repository Control

## Canonical identity

- Local path: `\\wsl.localhost\Ubuntu-24.04\home\nira\projects\dartio` (WSL: `/home/nira/projects/dartio`)
- Prior local paths, both dead: `/home/nira/dev/dartio`, moved during a machine-wide reorganization on 2026-07-28; and `C:\Users\nira\Documents\Codex\2026-07-17\rec\dartio`, retained read-only. The checkout stays WSL-native wherever it moves, because pnpm on `/mnt/c` aborts its modules-directory check without a TTY and pays the DrvFs IO penalty on every install and build; the same install takes 13 s in WSL.
- GitHub target: `https://github.com/ni1ra/dartio`
- Vercel project: `dartio` (`prj_tYySUSn7wfIjqFQA1KZsVJtDbLIM`)
- Product version: `1.0.0`
- UI dependency: Navi UI `1.0.0`
- Git author: `ni1ra <andreashoug@gmail.com>`. The address is what attributes a commit to the `ni1ra` GitHub account; the name had drifted to `andreashoug` and `Andreas` across earlier commits because Windows and WSL hold separate git configs. History is left as it stands — rewriting nine cycles of shared commits to fix a display name is not worth it.

## Operating facts

- This repository is greenfield. Never copy legacy Dartio source.
- Database: Neon project `dartio`, project `nameless-tooth-63658537`, branch `br-sweet-wildflower-afy2ygj6`, database `neondb`.
- Preview database branch: `vercel-preview` (`br-fragrant-art-af79dyw5`); Neon Auth is provisioned independently on main and preview.
- Neon Auth preview trusted domains include the stable Cycle 2 Vercel PR alias `https://dartio-git-cycle-2-identity-bill-2c0634-niras-projects-868b6f5f.vercel.app`; a fresh sandbox sign-up and authenticated `/account` projection passed there on 2026-07-17.
- Hosting: Vercel team `niras-projects-868b6f5f`.
- Payments: claimed Stripe sandbox `dartio-stripe`, resource `ir_afV2OHhg6q9l9S78`, connected to Preview and Production.
- Stripe sandbox account: `acct_1TtxM1ALEz0P7O2h`. Pro prices are EUR 7.99 monthly (`price_1TtzgyALEz0P7O2hBlv1fWHW`) and EUR 76.70 annually (`price_1TtzgzALEz0P7O2h82O61RF7`); Club prices are EUR 24 monthly (`price_1Ttzh0ALEz0P7O2hOsw6eCEr`) and EUR 230.40 annually (`price_1Ttzh1ALEz0P7O2harPzXoGH`). All are test-mode, active, tax-inclusive catalog objects.
- Voice: OpenAI transcription models are available; secrets stay in environment stores only.
- GitHub repository `ni1ra/dartio` is connected to Vercel with production branch `main`.
- Vercel has encrypted Production and Preview values for Neon database/Auth, Auth cookie secret, Pro and Club monthly/annual price IDs, `NEXT_PUBLIC_APP_URL`, Stripe integration/signing secrets, and `OPENAI_API_KEY`. This was verified by environment name and scope only; no secret value was printed.
- Preview migrations `0000` through `0005` are applied and ledger-reconciled as of 2026-07-17. External verification: 10 public tables, 6 migration journal rows, strict dart/email constraints, unique user Stripe-customer index, and nullable subscription/webhook lifecycle timestamps including `subscriptions.cancel_at timestamptz`.
- Production migrations `0000` through `0005` are applied and ledger-reconciled on main as of 2026-07-17. External verification matches Preview: 10 public tables, 6 migration journal rows, strict dart/email constraints, winner foreign key, Stripe uniqueness indexes, and nullable lifecycle timestamps including `subscriptions.cancel_at timestamptz`.
- Stripe webhook endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF` targets `https://dartioopus46.vercel.app/api/billing/webhook`, uses API version `2026-06-24.dahlia`, is active in sandbox, and listens to 18 subscription events. Customer Portal configuration is proven in sandbox; a complete subscription lifecycle remains an unproven release gate.
- Stripe Workbench request `req_RxZryIFiSs5OAC` proves the signed-in Pro annual Checkout request selected the configured price, persistent owned customer, 14-day trial, automatic tax, billing-address collection, promotion codes, ownership metadata, and an idempotency key. The initial request failed only because the sandbox lacked a head-office address. A synthetic Norwegian sandbox address subsequently saved and persisted across reload; no live legal or tax-registration data was created.
- Pro annual sandbox Checkout completed on 2026-07-17 for customer `cus_Utp4oZKj6432Jx`, creating trial subscription `sub_1Tu1j7ALEz0P7O2hD5xvbDeR` at EUR 76.70/year after 14 free days and EUR 0 due on creation.
- The original sandbox webhook destination returned HTTP 500 to the successful Checkout's invoice events because it targets the old production alias, while Preview owns the Checkout identity/database. Dedicated Preview destination `we_1Tu1pFALEz0P7O2hQVsTftWI` is active at the stable Cycle 2 alias and listens only to `checkout.session.completed` plus the eight current `customer.subscription.*` events. Vercel has a sensitive branch-scoped signing-secret override for `cycle-2-identity-billing-voice`; the global Preview/Production secret was not changed.
- Preview destination `we_1Tu1pFALEz0P7O2hQVsTftWI` processed two real Portal-cancellation `customer.subscription.updated` events with HTTP 200, zero failures, and 848–1305 ms response time on deployment `dpl_GvToqtNyNJCjzcGrYLDFVfZePqEV`. Neon stored both processed event IDs and exactly one owned Pro/trialing subscription row.
- Deployment `dpl_G2u7bDCCuSCJMeaciPTkXjdwj6mG` proved explicit cancellation recovery and reprojection: reactivation cleared `cancel_at`; rescheduling stored `cancel_at=2026-07-31T02:42:12Z` while keeping `cancel_at_period_end=false`, status `trialing`, plan `pro`, and one subscription row.
- GitHub release source: commit `80770b47d790411f0c5e72c92f9fd1aee326897a`; CI run `29546595422` passed.
- Current greenfield production deployment: `dpl_8rpA6xD1iydeTrjCm9JpztK4HFBy` at `https://dartioopus46.vercel.app`.
- Current Cycle 2 preview deployment: `dpl_71X1Gfea1BsPLSm6rAPir8AonjUK` at `https://dartio-lf4clhysm-niras-projects-868b6f5f.vercel.app`; entitled X01 continuity/access-authority head `e3a80a4` passed GitHub verification run `29554449332`. The stable branch alias points to this Ready deployment. Prior code Preview `dpl_AwDwqrqPYR8ufLdJUV5m91dQJLff` is the rollback target.
- Preview has a branch-scoped `NEXT_PUBLIC_APP_URL` override for `cycle-2-identity-billing-voice`, targeting its stable Vercel alias. The global Preview and Production values were not changed.
- Paid features are authorized server-side only. `voice_always_on` gates `POST /api/voice/transcribe` before body parsing; `advanced_ai` gates `POST /api/ai/turn` for levels 9–20 while 1–8 stay local; `advanced_checkout` gates `POST /api/checkout/advice` for alternates, setup plans, and preference ranking while Free computes one route locally. All three read the server's own access snapshot and accept no client plan, access, or seed claim.
- Club Checkout is closed: `PLAN_CATALOG.club.checkout` is `unavailable`, `POST /api/billing/checkout` returns 409 for any non-`self_serve` plan before Stripe is called, and the pricing surface disables the action. Existing Club subscribers keep their projected entitlements.
- The canonical record of a match is its event log, not its state: `src/domain/x01-log.ts` folds the pure reducers over what was thrown. Events carry the dart, not the thrower — turn order derives the player — so a visit is corrected by rewinding to it, never by excising it from the middle. The log is versioned and zod-validated on read (`src/domain/x01-persistence.ts`); an unknown version is discarded rather than migrated.
- Active matches resume from local storage with no account, because free play requires no account. Completed-match history in Neon is still unwritten; `matches`, `players`, `turns`, and `darts` have no writer as of 2026-07-28.
- Playable modes as of 2026-07-28: X01, Cricket (standard / cut-throat / tactics), Around the Clock, Shanghai, Count-Up, and Bob's 27. Checkout Lab, Doubles Matrix, and Scoring Sprint are catalogue rows only and are labelled as such.
- Every mode owns its rules and its log and imports nothing from another mode. What they share is the regulation board (`src/components/dartboard.tsx`), the per-dart pad, the keyboard scheme, visit rewind, and local resume. Adding a mode must not require editing an existing one.
- `pnpm test:browser` runs against production by setting `DARTIO_BASE_URL`. On 2026-07-28 it passed 115 with 2 skipped against `https://dartioopus46.vercel.app`. The suite grew from 102 in the same session: a green 102/102 had been reported against a deployment whose top bar offered a phone no way to sign in, because the suite asserted that `/auth/sign-in` answers 200 and never that a visitor could reach it. Nav reachability and accent-foreground contrast are now asserted rather than assumed.
- Known unfixed defect: `/api/auth/get-session` answers 500 when Neon Auth's upstream is unreachable, where Dartio's own routes answer a deliberate 503. A real Neon outage would report a server fault instead of degrading to local free play.
- **Production authentication is broken as of 2026-07-28.** No origin the app is served from is in the production Neon Auth project's trusted domains: `dartioopus46.vercel.app`, the canonical `dartio-*.vercel.app` deployment URL, and `dartio.vercel.app` all return `403 INVALID_ORIGIN` on sign-up and sign-in. Preview was configured this way and production never was. The fix is a Neon console change, not a repository change.
- There is no admin or superadmin role. `users` carries no role column and no admin surface exists.
- Supabase is explicitly out of scope.
- Never store secret values in repository files or documentation.

## Canonical commands

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:browser:install` (once per machine)
- `pnpm test:browser` — 117 checks across 390×844, 834×1112, and 1440×1000; 115 run and 2 skip by design, those being the sign-up assertion at the two widths where sign-up is deliberately absent. Set `DARTIO_BASE_URL` to run them against a preview or production deployment instead of a local build
- `pnpm db:generate`

## Release ladder

0. `pnpm verify:auth <deployment-url>` — a deployment can serve 200s on every route while authentication is entirely dead, because Neon Auth enforces trusted origins on its own service. This is the only check that catches it.
1. Local deterministic checks.
2. Local browser stories at mobile, tablet, and desktop.
3. GitHub pull request with CI.
4. Vercel preview with sandbox integrations.
5. Production deployment and post-deploy verification only after preview proof.

## Rollback

- Vercel retains prior ready production deployments.
- Recoverable pre-greenfield production target: `dpl_2CiBPFdxJzJe6vYwu8vk4QEzLm4x`. It serves the legacy build and is rollback-only, never greenfield v1 proof.
- Database changes require forward-safe migrations and an explicit escape path.
- Stripe remains in sandbox until live transaction proof is explicitly authorized.

## Known release gates

- The regulation dartboard gate is executable as of 2026-07-28: `tests/browser/dartboard.spec.ts` asserts one square in-bounds SVG, 80 scoring beds, 20 numerals, and a physical treble-twenty click scoring 60 / leaving 441, at all three viewports. Board changes rerun it through `pnpm test:browser`.
- Navi UI is the component system, and third-party stylesheets that ship an unlayered reset must be scoped to their own route segment. `@neondatabase/auth/ui/css` loads from `src/app/auth/layout.tsx` for this reason; loading it globally strips border, background, and radius off every Navi component, because unlayered CSS outranks Navi's `@layer navi.*` at any specificity.
- The regulation dartboard and three-viewport production visual proof passed; future board changes must rerun the same physical T20 and boundary suite.
- Cycle 2 preview repeated the dartboard gate at exact 1440×1000, 834×1112, and 390×844 viewports: 3/3 independent contexts passed square/in-bounds geometry, 80 beds, 20 labels, zero horizontal overflow, and physical T20 → 60 / 441. Full-page tablet/mobile visual inspection also passed. Ultrawide review found and corrected a shell-centering cascade defect outside the board renderer; the corrected preview measured a centered 1472 px stage at `x=544` on a 2560 px viewport, retained a 600×600 board, and passed the full three-width matrix again with zero retries.
- Figma library implementation is externally blocked by the current one-mode/View-seat limitation.
- Full Dartio v1 functionality remains open beyond Cycle 1: additional game modes, server-authoritative friend rooms/reconnect, real always-on transcription, persisted match/stat flows, and end-to-end Stripe Checkout/Portal/webhook proof.
- Checkout success and Portal return URLs must target the implemented `/account` hub. The nonexistent `/account/billing` target was removed on 2026-07-17 and is covered by the billing policy test.
- Stripe Customer Portal opened for the authenticated QA identity and returned to `/account` without a route error. Before the branch-scoped origin override, that return resolved to the old main alias and lost the new authenticated account surface. Deployment `dpl_8q1KD49P1Se5YxKFrSxrpGFwFAZL` proved the corrected same-origin path returns to the stable Preview alias with verified identity and active session preserved.
