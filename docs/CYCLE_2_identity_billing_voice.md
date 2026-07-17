# Cycle 2 — Identity, Billing, and Voice Activation

Status: active

Derived from: `PHASE_1_v1_foundation.md`

## Slice

- [x] Replace the account placeholder with real Neon Auth session, sign-in, sign-out, profile, and recovery states.
  - [x] Repair the conversion-blocking `/auth/sign-up` 404 by mounting the shared Neon Auth sign-up view with the same verified `/account` redirect.
- [x] Persist verified Auth identities into Dartio users/profiles without conflating external subjects with internal UUIDs.
- [x] Make Pro and Club monthly/annual choices actionable through authenticated Stripe Checkout.
- [ ] Complete Stripe Customer Portal, webhook endpoint/signing secret, entitlement projection, replay, cancellation, grace, and recovery flows.
- [ ] Verify a complete Stripe sandbox subscription and portal lifecycle before enabling any live-mode price.
- [x] Implement push-to-talk transcription with structured score/command parsing and visible confirmation/error states.
- [x] Implement opt-in always-on voice lifecycle with explicit listening, paused, processing, ambiguity, and privacy states.
- [x] Make voice input feed the same X01 command path as touch/keyboard input.
- [x] Run deterministic type, lint, unit, build, and dartboard regression checks.
- [ ] Run deployed identity, billing, voice, and three-theme browser stories across phone/tablet/desktop.
  - [x] Verify the deployed match and dartboard at 1440×1000, 834×1112, and 390×844: zero horizontal overflow, square/in-bounds SVG, 80 scoring beds, 20 labels, and physical T20 → 60 / 441 at every width.
  - [x] Inspect full-page tablet/mobile match layouts and correct the ultrawide shell cascade so the 92 rem stage centers above 1472 px without changing board geometry.
  - [x] Verify deployed signed-out Account and Pricing states: local play remains available, Pro/Club actions route to `/auth/sign-in`, and anonymous users cannot create Stripe Checkout sessions.
  - [x] Inspect the settled Black, Silver, and Blood dartboard themes at desktop width; all retain 80 beds, legible labels/rings, and zero overflow.
  - [ ] Complete the remaining three-theme, identity, and real-microphone deployed stories.
- [ ] Deploy through preview, verify identity/billing/voice stories, then promote and rerun production proof.
  - [x] Deploy corrected Cycle 2 preview `dpl_CWNL8PeTEGk2W2uVKSsS1EVqgkwZ` from commit `58c80dc` and pass GitHub verification run `29549237725`.
- [x] Reconcile Phase 1 and REPO_CONTROL with exact local, Neon, Stripe, and Vercel receipts and remaining gates.

## Verified receipts — 2026-07-17

- Local gates: `git diff --check`, TypeScript, ESLint with zero warnings, 132 tests across 13 files, and the Next.js 16.2.10 production build with 15 routes passed.
- Identity and billing migrations `0003` and `0004` were applied transactionally to Neon Preview (`br-fragrant-art-af79dyw5`) and Main (`br-sweet-wildflower-afy2ygj6`). Both branches now contain five Drizzle journal rows and the nullable webhook/subscription lifecycle timestamps required by the idempotent projection.
- Stripe sandbox account `acct_1TtxM1ALEz0P7O2h` contains active Pro and Club monthly/annual EUR prices and webhook endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF`, listening to 18 subscription lifecycle events at the stable production alias.
- Vercel server-side environment listing confirms `STRIPE_CLUB_MONTHLY_PRICE_ID`, `STRIPE_CLUB_ANNUAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `OPENAI_API_KEY` are encrypted and scoped to Preview and Production.
- The regulation dartboard renderer and scoring geometry were not changed in this cycle. The Cycle 2 preview passed a fresh exact-width browser matrix at 1440×1000, 834×1112, and 390×844: one square/in-bounds SVG, 80 beds, 20 labels, no horizontal overflow, and a physical click on the T20 path producing T20 / 60 / 441 in all three independent browser contexts. Full-page tablet/mobile visual inspection found no warped rings, drifting wires, clipped numbers, overlapping score controls, or command-dock/navigation collision.
- Harsh ultrawide inspection found the 92 rem Navi shell left-anchored because an unlayered consumer reset overrode Navi UI's layered auto margins. A Dartio integration rule now recenters the main shell only above 1472 px and preserves the full-width navigation calculation; it does not touch dartboard selectors, renderer code, or the three primary breakpoints.
- The corrected preview measured the 2560 px shell at `x=544`, width `1472`, with a 2560 px navigation surface, a 600×600 board, 80 paths, and no horizontal overflow. The exact 1440×1000, 834×1112, and 390×844 T20 matrix was then repeated against that deployment and passed 3/3 with zero retries.
- Not yet proven: Stripe Customer Portal configuration, a complete authenticated Checkout → signed webhook → entitlement → Portal → cancellation story, real microphone transcription in a deployed browser, and production promotion.

## Acceptance proof

- A signed-out user can discover sign-in through visible controls, authenticate through Neon Auth, return to Dartio, and see a persisted account state.
- A signed-in sandbox user can choose Pro monthly or annual, complete Stripe Checkout, receive the correct entitlement through a signed/idempotent webhook, open Customer Portal, and cancel without duplicate customers or subscriptions.
- A user can speak a valid X01 score or command, review the recognized result, apply it through the same game engine as manual input, and recover cleanly from ambiguity or denied microphone permission.
- All named flows have loading, empty, error, keyboard, reduced-motion, and responsive proof; paid live mode remains disabled until sandbox evidence passes.
