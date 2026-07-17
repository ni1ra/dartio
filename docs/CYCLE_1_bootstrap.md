# Cycle 1 — Greenfield Vertical Slice

Status: active — GitHub CI and preview release tail

Derived from: `PHASE_1_v1_foundation.md`

## Slice

- [x] Initialize Next.js, TypeScript, tests, CI, env validation, and `1.0.0` metadata.
- [x] Consume Navi UI through its immutable `v1.0.0` package contract.
- [x] Implement the pure game kernel for throws, turns, X01, checkout routes, and AI level progression.
- [x] Implement a real playable local X01 vertical slice with visual dartboard, keypad/score input, undo, checkout help, and AI 1–20.
- [x] Implement initial Neon schema/migrations and persistence adapters without secret values.
- [x] Implement Stripe pricing/entitlement contract and webhook route skeleton with signature/idempotency tests.
- [x] Build the landing, setup, and match paths in all three themes.
- [x] Verify unit/domain tests, types, lint, production build, and browser stories at phone/tablet/desktop widths.
- [x] Update Phase 1 evidence and REPO_CONTROL with actual receipts.
- [x] Resolve all high/critical dependency audit findings in the Neon Auth tree.
- [ ] Push the greenfield repository and pass GitHub CI.
- [ ] Deploy and verify the Cycle 1 user story on Vercel Preview.

## Acceptance proof

- A user reaches X01 setup from the landing page through visible controls.
- A user can configure X01, play against any AI level 1–20, enter darts/scores, see board/score/history update, receive valid checkout help, undo a turn, and finish a leg.
- The same flow works at mobile, tablet, and desktop widths with keyboard focus and reduced motion.
- Neon and Stripe boundaries compile and pass deterministic tests without requiring production secrets.
- `package.json` is `1.0.0` and depends on Navi UI `1.0.0` through a releaseable package contract.

## Evidence to date

- Local gates: typecheck and zero-warning lint pass; 97/97 tests pass; Next production build emits 15 routes; Drizzle reports zero schema drift.
- Navi dependency: immutable GitHub `v1.0.0` release tarball with SHA-512 integrity in `pnpm-lock.yaml`.
- Regulation board: physical 170/107/8/31.8/12.7 mm dimensions drive render, hit testing, representative input, and AI aiming.
- Browser proof: physical T20 click records T20 and 501→441 at 1440×1000, 834×1112, and 390×844; no distortion, overflow, console warnings/errors, network failures, or content overlap.
- Neon Preview: migrations 0000–0002 applied; 10 public tables and 3 journal rows verified with strict dart/email/Stripe ownership constraints.
- Vercel: GitHub connected to `ni1ra/dartio`, production branch `main`; separate encrypted Production/Preview database, Auth, cookie-secret, and Pro-price values are present.
- Dependency security: Better Auth, passkey, and API-key are coherently pinned at 1.6.13; Neon beta declaration/import seams are reproducibly patched; peers pass; high/critical audit gate is clean. One disclosed moderate esbuild development-server advisory remains upstream and is not used by deployed runtime.
