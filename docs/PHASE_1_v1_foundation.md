# Phase 1 — Dartio v1.0.0 Foundation

Status: active

## Outcome

Build and release a fresh Dartio `v1.0.0` using Navi UI `v1.0.0`, Neon PostgreSQL, Stripe, OpenAI transcription, and Vercel.

## Workstreams

- [ ] Repository and system contracts
  - [x] Initialize a fresh Next.js/TypeScript repository with no legacy source.
  - [ ] Lock game engine, persistence, auth, billing, voice, multiplayer, and deployment boundaries.
  - [x] Verify version and dependency contracts.
- [ ] Game domain
  - [ ] Implement X01 options: starting score, legs/sets, straight/double/master in, straight/double/master out, bust rules, and checkout assistance.
  - [ ] Implement Cricket options: standard/cut-throat, points, rounds, and open-number behavior.
  - [ ] Implement Around the Clock, Shanghai, Count-Up, Bob's 27, checkout practice, doubles practice, and scoring practice.
  - [ ] Implement immutable turn events, undo/correction, complete rules, and perfect companion inputs.
  - [ ] Implement AI levels 1–20 with measured accuracy progression and believable miss distribution.
- [ ] Match experience
  - [x] Implement responsive visual dartboard input and throw visualization.
  - [x] Synchronize throws, scoreboards, checkout routes, history, and turn state for X01.
  - [ ] Implement local friend play and server-authoritative online room foundations with reconnect.
  - [ ] Implement accessible keyboard/touch alternatives and correction flows.
- [ ] Voice scoring
  - [x] Implement push-to-talk and opt-in always-on session modes.
  - [x] Use OpenAI transcription with structured command parsing through the current shared game-command path.
  - [x] Implement confirmation, ambiguity, correction, privacy, and failure states.
  - [ ] Extend and prove the shared voice-command path across every remaining game mode.
- [ ] Checkout intelligence
  - [ ] Implement dynamic professional routes, alternate paths, setup shots, bogey detection, and dart-count context.
  - [ ] Support player preferences and explain route changes after each dart.
  - [ ] Verify known checkout fixtures and invalid-route rejection.
- [ ] Product, navigation, and responsive UI
  - [ ] Build the dynamic landing page, game lobby, setup, match, friends, practice, stats, billing, and account paths.
  - [x] Use Navi UI as the only component/theme system.
  - [x] Verify deep black, bright silver, and blood red themes across mobile, tablet, and desktop for the Cycle 1 paths.
- [ ] Membership and Stripe
  - [x] Define free and paid plans, entitlements, trials/discount policy, annual/monthly pricing, cancellation, and grace behavior.
  - [x] Implement Stripe Checkout, Customer Portal, idempotent webhooks, entitlement projection, and recovery states.
    - [x] Implement authenticated Pro/Club monthly/annual Checkout, Portal session endpoint, idempotent webhook projection, and recovery UI.
    - [x] Configure and prove Customer Portal plus Checkout, signed projection, scheduled cancellation, and reactivation in sandbox.
  - [x] Verify a sandbox Pro annual transaction and real signed webhook updates before any live activation.
  - [ ] Connect projected entitlements to every paid product feature and verify fail-closed consumption.
- [ ] Neon and operations
  - [x] Implement and deploy the initial migrations, constraints, indexes, and ownership model.
  - [x] Deploy identity and billing lifecycle migrations `0003` through `0005` to Preview and Main.
  - [ ] Implement observable error handling, analytics events, and rollback paths.
  - [x] Connect GitHub CI and Vercel preview/production environments.
- [ ] Phase closure
  - [ ] Run audit, production readiness, bug search, bug fixes, docs drift, and closure.

## Explicit queue from lain

- [ ] Recon legacy repositories for functionality only; do not reuse their code.
- [ ] Build both repositories completely from scratch and leave no legacy code in the new repos.
- [ ] Make Dartio `v1.0.0` consume Navi UI `v1.0.0`.
- [ ] Use Neon, not Supabase.
- [ ] Deliver production-ready Stripe pricing and a strong dynamic checkout helper with professional paths.
