# Cycle 2 — Identity, Billing, and Voice Activation

Status: active

Derived from: `PHASE_1_v1_foundation.md`

## Slice

- [x] Replace the account placeholder with real Neon Auth session, sign-in, sign-out, profile, and recovery states.
- [x] Persist verified Auth identities into Dartio users/profiles without conflating external subjects with internal UUIDs.
- [x] Make Pro and Club monthly/annual choices actionable through authenticated Stripe Checkout.
- [ ] Complete Stripe Customer Portal, webhook endpoint/signing secret, entitlement projection, replay, cancellation, grace, and recovery flows.
- [ ] Verify a complete Stripe sandbox subscription and portal lifecycle before enabling any live-mode price.
- [x] Implement push-to-talk transcription with structured score/command parsing and visible confirmation/error states.
- [x] Implement opt-in always-on voice lifecycle with explicit listening, paused, processing, ambiguity, and privacy states.
- [x] Make voice input feed the same X01 command path as touch/keyboard input.
- [x] Run deterministic type, lint, unit, build, and dartboard regression checks.
- [ ] Run deployed identity, billing, voice, and three-theme browser stories across phone/tablet/desktop.
- [ ] Deploy through preview, verify identity/billing/voice stories, then promote and rerun production proof.
- [x] Reconcile Phase 1 and REPO_CONTROL with exact local, Neon, Stripe, and Vercel receipts and remaining gates.

## Verified receipts — 2026-07-17

- Local gates: `git diff --check`, TypeScript, ESLint with zero warnings, 132 tests across 13 files, and the Next.js 16.2.10 production build with 15 routes passed.
- Identity and billing migrations `0003` and `0004` were applied transactionally to Neon Preview (`br-fragrant-art-af79dyw5`) and Main (`br-sweet-wildflower-afy2ygj6`). Both branches now contain five Drizzle journal rows and the nullable webhook/subscription lifecycle timestamps required by the idempotent projection.
- Stripe sandbox account `acct_1TtxM1ALEz0P7O2h` contains active Pro and Club monthly/annual EUR prices and webhook endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF`, listening to 18 subscription lifecycle events at the stable production alias.
- Vercel server-side environment listing confirms `STRIPE_CLUB_MONTHLY_PRICE_ID`, `STRIPE_CLUB_ANNUAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `OPENAI_API_KEY` are encrypted and scoped to Preview and Production.
- The regulation dartboard renderer and scoring geometry were not changed in this cycle. Its prior desktop/tablet/mobile physical-T20 proof remains under `docs/artifacts/`; deployed regression proof is still required for the new preview.
- Not yet proven: Stripe Customer Portal configuration, a complete authenticated Checkout → signed webhook → entitlement → Portal → cancellation story, real microphone transcription in a deployed browser, and production promotion.

## Acceptance proof

- A signed-out user can discover sign-in through visible controls, authenticate through Neon Auth, return to Dartio, and see a persisted account state.
- A signed-in sandbox user can choose Pro monthly or annual, complete Stripe Checkout, receive the correct entitlement through a signed/idempotent webhook, open Customer Portal, and cancel without duplicate customers or subscriptions.
- A user can speak a valid X01 score or command, review the recognized result, apply it through the same game engine as manual input, and recover cleanly from ambiguity or denied microphone permission.
- All named flows have loading, empty, error, keyboard, reduced-motion, and responsive proof; paid live mode remains disabled until sandbox evidence passes.
