# Dartio Repository Control

## Canonical identity

- Local path: `C:\Users\nira\Documents\Codex\2026-07-17\rec\dartio`
- GitHub target: `https://github.com/ni1ra/dartio`
- Vercel project: `dartio` (`prj_tYySUSn7wfIjqFQA1KZsVJtDbLIM`)
- Product version: `1.0.0`
- UI dependency: Navi UI `1.0.0`
- Git author: `andreashoug <andreashoug@gmail.com>`

## Operating facts

- This repository is greenfield. Never copy legacy Dartio source.
- Database: Neon project `dartio`, project `nameless-tooth-63658537`, branch `br-sweet-wildflower-afy2ygj6`, database `neondb`.
- Preview database branch: `vercel-preview` (`br-fragrant-art-af79dyw5`); Neon Auth is provisioned independently on main and preview.
- Hosting: Vercel team `niras-projects-868b6f5f`.
- Payments: claimed Stripe sandbox `dartio-stripe`, resource `ir_afV2OHhg6q9l9S78`, connected to Preview and Production.
- Stripe sandbox account: `acct_1TtxM1ALEz0P7O2h`. Pro prices are EUR 7.99 monthly (`price_1TtzgyALEz0P7O2hBlv1fWHW`) and EUR 76.70 annually (`price_1TtzgzALEz0P7O2h82O61RF7`); Club prices are EUR 24 monthly (`price_1Ttzh0ALEz0P7O2hOsw6eCEr`) and EUR 230.40 annually (`price_1Ttzh1ALEz0P7O2harPzXoGH`). All are test-mode, active, tax-inclusive catalog objects.
- Voice: OpenAI transcription models are available; secrets stay in environment stores only.
- GitHub repository `ni1ra/dartio` is connected to Vercel with production branch `main`.
- Vercel has encrypted Production and Preview values for Neon database/Auth, Auth cookie secret, Pro and Club monthly/annual price IDs, `NEXT_PUBLIC_APP_URL`, Stripe integration/signing secrets, and `OPENAI_API_KEY`. This was verified by environment name and scope only; no secret value was printed.
- Preview migrations `0000` through `0004` were applied transactionally on 2026-07-17. External verification: 10 public tables, 5 migration journal rows, strict dart/email constraints, unique user Stripe-customer index, and nullable subscription/webhook lifecycle timestamps.
- Production migrations `0000` through `0004` were applied transactionally to main on 2026-07-17. External verification matches Preview: 10 public tables, 5 migration journal rows, strict dart/email constraints, winner foreign key, Stripe uniqueness indexes, and nullable lifecycle timestamps.
- Stripe webhook endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF` targets `https://dartioopus46.vercel.app/api/billing/webhook`, uses API version `2026-06-24.dahlia`, is active in sandbox, and listens to 18 subscription events. Customer Portal configuration and a complete subscription lifecycle remain unproven release gates.
- GitHub release source: commit `80770b47d790411f0c5e72c92f9fd1aee326897a`; CI run `29546595422` passed.
- Current greenfield production deployment: `dpl_8rpA6xD1iydeTrjCm9JpztK4HFBy` at `https://dartioopus46.vercel.app`.
- Current Cycle 2 preview deployment: `dpl_33SK5cREqKE35yjBaqnG2ntLk7Pw` at `https://dartio-634qvegtg-niras-projects-868b6f5f.vercel.app`; GitHub verification run `29548727067` passed before the ultrawide follow-up commit.
- Supabase is explicitly out of scope.
- Never store secret values in repository files or documentation.

## Canonical commands

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm db:generate`

## Release ladder

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

- The regulation dartboard and three-viewport production visual proof passed; future board changes must rerun the same physical T20 and boundary suite.
- Cycle 2 preview repeated the dartboard gate at exact 1440×1000, 834×1112, and 390×844 viewports: 3/3 independent contexts passed square/in-bounds geometry, 80 beds, 20 labels, zero horizontal overflow, and physical T20 → 60 / 441. Full-page tablet/mobile visual inspection also passed. Ultrawide review found and locally corrected a shell-centering cascade defect outside the board renderer; the follow-up preview still requires deployment verification.
- Figma library implementation is externally blocked by the current one-mode/View-seat limitation.
- Full Dartio v1 functionality remains open beyond Cycle 1: additional game modes, server-authoritative friend rooms/reconnect, real always-on transcription, persisted match/stat flows, and end-to-end Stripe Checkout/Portal/webhook proof.
