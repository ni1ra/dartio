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
- Stripe sandbox account: `acct_1TtyEARjf8C9cHpO`. Pro prices are EUR 7.99 monthly (`price_1TtzgyALEz0P7O2hBlv1fWHW`) and EUR 76.70 annually (`price_1TtzgzALEz0P7O2h82O61RF7`); Club prices are EUR 24 monthly (`price_1Ttzh0ALEz0P7O2hOsw6eCEr`) and EUR 230.40 annually (`price_1Ttzh1ALEz0P7O2harPzXoGH`). All are test-mode, active, tax-inclusive catalog objects.
- Voice: OpenAI transcription models are available; secrets stay in environment stores only.
- GitHub repository `ni1ra/dartio` is connected to Vercel with production branch `main`.
- Vercel has separate encrypted Production and Preview values for Neon database, Neon Auth, Auth cookie secret, and Pro monthly/annual price IDs. Stripe integration secrets cover both targets; OpenAI currently covers Production only. App origin and webhook signing secret remain deployment-derived gates.
- Preview migrations `0000` through `0002` were applied through Drizzle on 2026-07-17. External verification: 10 public tables, 3 migration journal rows, both strict dart constraints, normalized-email constraint, and unique user Stripe-customer index.
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
- Current recoverable production target before greenfield promotion: `dpl_2CiBPFdxJzJe6vYwu8vk4QEzLm4x`. It still serves the legacy build and must not be treated as greenfield v1 proof.
- Database changes require forward-safe migrations and an explicit escape path.
- Stripe remains in sandbox until live transaction proof is explicitly authorized.

## Known release gates

- Regulation-derived dartboard radii and refreshed three-viewport visual proof are in correction.
- Figma library implementation is externally blocked by the current one-mode/View-seat limitation.
- Full Dartio v1 functionality remains open beyond Cycle 1: additional game modes, server-authoritative friend rooms/reconnect, real always-on transcription, persisted match/stat flows, and end-to-end Stripe Checkout/Portal/webhook proof.
