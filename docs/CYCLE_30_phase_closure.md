# Cycle 30 — Phase 3 Closure and Sandbox Promotion

Status: active on `codex/cycle-30-phase-closure`.

Final cycle of `PHASE_3_promise_completion.md`. The seven implementation cycles
are live. This closure does two things that cannot be replaced by another claim:
it removes the last public copy that still describes shipped Pro capabilities as
future work, and it uses Stripe's real Sandbox Checkout path to prove a one-use
100%-off subscription all the way through webhook authority and cancellation.

## Product and billing contract

- Availability data is the source of truth for product claims. Advanced
  checkout, deep statistics, practice paths, and online rooms are implemented;
  pricing and account surfaces say so. Club administration remains unavailable
  and stays visibly separate from online rooms.
- Stripe Hosted Checkout remains the only coupon-entry surface. Dartio creates
  no coupon table, admin coupon editor, query-string bypass, or client-authored
  discount. Normal Pro Checkout keeps `allow_promotion_codes: true`,
  `payment_method_collection: "always"`, and no pre-applied `discounts` field.
- The release proof creates one short-lived Stripe Sandbox promotion code backed
  by a 100%-off, forever coupon restricted to the actual Pro product and usable
  once. It never uses live-mode keys or a real payment method.
- A trial Checkout already owes zero today, so its Session total is not causal
  proof. The proof is the subscription's next full invoice preview: gross Pro
  amount above zero, discount equal to that amount, and `amount_due` zero.
- The signed Production webhook must project the resulting subscription into
  Dartio before paid AI and voice are called. Portal cancellation must then be
  accepted and projected, leaving no later full-price renewal.

The contract follows the current Stripe primary references checked on
2026-08-12: [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create),
[coupon creation](https://docs.stripe.com/api/coupons/create),
[invoice previews](https://docs.stripe.com/api/invoices/create_preview), and
[Sandbox test values](https://docs.stripe.com/testing). `payment_method_collection:
"if_required"` is deliberately not used: Stripe documents that it omits a
payment method whenever a trial or discount makes the current total zero.

## Queue

- [ ] Replace stale account, pricing, and landing claims with availability-
  accurate copy; preserve the deliberate Club-management and custom-practice
  coming-soon boundaries.
- [ ] Lock the Hosted Checkout promotion contract in deterministic tests:
  customer-entered codes enabled, normal payment-method collection retained,
  and no undisclosed discount injected by Dartio.
- [ ] Add focused three-viewport browser proof for the corrected pricing and
  account truth, including responsive layout, keyboard focus, error/loading,
  signed-out, Free, and Pro states.
- [ ] Provision and redeem one short-lived, one-use, Pro-product-only 100%-off
  code in Stripe Sandbox through real Dartio Production Checkout; record object
  identities only, never the code, key, cookie, or payment details.
- [ ] Prove the next full invoice has a non-zero Pro gross amount, an equal
  discount, and zero due; prove the signed webhook grants canonical Pro access;
  pass paid AI and paid voice against Production.
- [ ] Cancel through the Stripe Customer Portal, prove the cancellation webhook
  projects the end state, and ensure the single-use promotion cannot be reused.
- [ ] Pass full local deterministic/browser gates, independent audit, one exact-
  head PR/CI/Preview, merge, main CI, standing Production verifiers, touched and
  full Production browser matrices.
- [ ] Re-score every Phase 3 promise against `main`, archive Cycles 23–30 only
  after Production closure, name the honest remainder, and open the improved
  Phase 4 credibility queue from evidence rather than an invented recovery.

## Release safety

Stripe operations are Sandbox-only. The code never contains a coupon code,
Stripe key, card value, cookie, or customer secret. No live-mode object, real
money, destructive database operation, schema migration, or force-push is
allowed. The one Sandbox subscription is recoverable through Customer Portal;
the promotion expires quickly and can be redeemed only once. Code rollback is
one prior Vercel deployment because the application schema does not change.

## Receipts

Planning inventory, 2026-08-12:

- Branch `codex/cycle-30-phase-closure` starts from exact Cycle 29 Production
  merge `6f0c2517cae6d00dd3465ccff68624b52517b51c` with a clean worktree.
- `checkoutSessionParams` already sends `allow_promotion_codes: true` and
  `payment_method_collection: "always"`; the existing pricing surface says
  promotion codes are accepted. The missing repository proof is the explicit
  negative assertion that Dartio does not inject `discounts`.
- Account copy still says online rooms are being built in two places. Pricing
  still labels advanced checkout, deep statistics, practice paths, and online
  rooms `COMING SOON` even though the availability contract marks them
  implemented. The landing source comment likewise denies shipped live rooms.
- Stale PR #30 contains only one still-useful test change plus superseded Cycle
  25 documentation. It will not be merged wholesale; the small contract test is
  re-derived on this branch and the stale PR is closed after replacement.

Implementation, Sandbox, local, Preview, CI, merge, Production, archive, and
Phase 4 opening receipts remain open until their exact commands finish.
