# Phase 4 — Credibility Campaign

Status: active. Opened 2026-08-12.

This queue is explicitly reconstructed from the shipped product, the manifesto,
Phase 3's receipts, and the remaining evidence gaps. No Phase 4 file or Cycle
31–37 description existed in reachable or recovered repository history; this
document does not pretend one was restored.

Phase 3 made Dartio's existing promises true. Phase 4 makes the product credible
under real commercial and operational conditions: a real payment that can reach
the operator's bank, voice beyond X01, advice informed by actual player history,
custom practice, multiplayer under bad networks, and measurable release quality.

## Standing rules

- One cycle, one branch, one PR; exact-head Preview and CI before merge, exact-SHA
  Production verification after merge.
- Personal identity, payout details, payment methods, keys, cookies, and webhook
  secrets stay only in provider-owned secure forms or secret stores. Repository
  receipts contain object IDs and aggregate outcomes only.
- Real-money changes use the smallest honest transaction that proves the path.
  The operator has authorized a sub-NOK-100 transaction; no broader spend follows
  from that permission.
- Database changes remain additive. Destructive database work still requires a
  recoverable snapshot, exact target proof, and separate authority.
- A flaky provider or network result is recorded before a bounded retry; the
  retry never erases the first observation.

## Queue

- [ ] **Cycle 31 — Revenue activation and bank payout.** Complete Stripe Live
  business/payout onboarding, create the Live catalogue and narrow subscription
  webhook, switch Dartio from Sandbox to Live with a reversible environment
  cutover, buy one real Pro subscription for less than NOK 100, prove webhook
  entitlement and Portal lifecycle, then prove the resulting available balance
  reaches the verified bank payout destination. No PayPal or second bank is
  introduced unless Stripe itself cannot support the primary payout path. See
  `CYCLE_31_revenue_activation.md`.
- [x] **Cycle 32 — Voice at every scoring surface.** Reuse the existing
  confidence/FIFO/lifecycle controller for Cricket, round modes, drills, and
  eligible room play; extend vocabulary without mode leakage; harden the live
  fixture after Cycle 30's observed provider variance. See
  `CYCLE_32_voice_everywhere.md`.
- [x] **Cycle 33 — Personalized checkout intelligence.** Feed the existing
  server-authorized advanced checkout feature only aggregate, consented player
  evidence; prove alternatives and setup routes improve without inventing
  precision when history is sparse. See `CYCLE_33_personalized_checkout.md`.
- [x] **Cycle 34 — Custom practice.** Turn the deliberately `coming_soon`
  custom-practice entitlement into a small, real rules-defined builder with
  versioned resume, replay/statistics truth, and no generic-rule duplication.
  See `CYCLE_34_custom_practice.md`.
- [ ] **Cycle 35 — Rooms under bad networks.** Exercise reconnect, duplicate
  delivery, delayed handover, terminal races, and recovery UI under controlled
  latency/loss while preserving the server's visit-level authority. See
  `CYCLE_35_room_resilience.md`.
- [ ] **Cycle 36 — Accessibility, performance, and operations.** Run a measured
  audit over all public and scoring surfaces, close actionable WCAG and keyboard
  gaps, set realistic performance budgets, and make production failures
  diagnosable without logging private match, voice, auth, or billing data.
- [ ] **Cycle 37 — Credibility closure.** Re-score every manifesto and pricing
  claim against `main`, repeat the full release ladder and real billing/payout
  evidence, archive Cycles 31–37, and leave only a concrete post-v1 backlog.

## Phase-level gate

Phase 4 closes only after the canonical Production deployment passes auth,
history, rooms, paid AI, paid voice, the complete three-viewport browser matrix,
and a real Live Stripe payment/webhook/Portal/payout path. A Sandbox receipt or a
Dashboard status without a settled bank payout is not the revenue proof.
