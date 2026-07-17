# Phase 1 — Dartio v1.0.0 Foundation

Status: active

## Outcome

Build and release a fresh Dartio `v1.0.0` using Navi UI `v1.0.0`, Neon PostgreSQL, Stripe, OpenAI transcription, and Vercel.

## Workstreams

- [ ] Repository and system contracts
  - [ ] Initialize a fresh Next.js/TypeScript repository with no legacy source.
  - [ ] Lock game engine, persistence, auth, billing, voice, multiplayer, and deployment boundaries.
  - [ ] Verify version and dependency contracts.
- [ ] Game domain
  - [ ] Implement X01 options: starting score, legs/sets, straight/double/master in, straight/double/master out, bust rules, and checkout assistance.
  - [ ] Implement Cricket options: standard/cut-throat, points, rounds, and open-number behavior.
  - [ ] Implement Around the Clock, Shanghai, Count-Up, Bob's 27, checkout practice, doubles practice, and scoring practice.
  - [ ] Implement immutable turn events, undo/correction, complete rules, and perfect companion inputs.
  - [ ] Implement AI levels 1–20 with measured accuracy progression and believable miss distribution.
- [ ] Match experience
  - [ ] Implement responsive visual dartboard input and throw visualization.
  - [ ] Synchronize throws, scoreboards, checkout routes, history, and turn state.
  - [ ] Implement local friend play and server-authoritative online room foundations with reconnect.
  - [ ] Implement accessible keyboard/touch alternatives and correction flows.
- [ ] Voice scoring
  - [ ] Implement push-to-talk and opt-in always-on session modes.
  - [ ] Use OpenAI transcription with structured command parsing for every game mode.
  - [ ] Implement confirmation, ambiguity, correction, privacy, and failure states.
- [ ] Checkout intelligence
  - [ ] Implement dynamic professional routes, alternate paths, setup shots, bogey detection, and dart-count context.
  - [ ] Support player preferences and explain route changes after each dart.
  - [ ] Verify known checkout fixtures and invalid-route rejection.
- [ ] Product, navigation, and responsive UI
  - [ ] Build the dynamic landing page, game lobby, setup, match, friends, practice, stats, billing, and account paths.
  - [ ] Use Navi UI as the only component/theme system.
  - [ ] Verify deep black, bright silver, and blood red themes across mobile, tablet, and desktop.
- [ ] Membership and Stripe
  - [ ] Define free and paid plans, entitlements, trials/discount policy, annual/monthly pricing, cancellation, and grace behavior.
  - [ ] Implement Stripe Checkout, Customer Portal, idempotent webhooks, entitlement projection, and recovery states.
  - [ ] Verify sandbox transactions and webhook replay before any live activation.
- [ ] Neon and operations
  - [ ] Implement migrations, constraints, indexes, ownership, and least-privilege data access.
  - [ ] Implement observable error handling, analytics events, and rollback paths.
  - [ ] Connect GitHub CI and Vercel preview/production environments.
- [ ] Phase closure
  - [ ] Run audit, production readiness, bug search, bug fixes, docs drift, and closure.

## Explicit queue from lain

- [ ] Recon legacy repositories for functionality only; do not reuse their code.
- [ ] Build both repositories completely from scratch and leave no legacy code in the new repos.
- [ ] Make Dartio `v1.0.0` consume Navi UI `v1.0.0`.
- [ ] Use Neon, not Supabase.
- [ ] Deliver production-ready Stripe pricing and a strong dynamic checkout helper with professional paths.

