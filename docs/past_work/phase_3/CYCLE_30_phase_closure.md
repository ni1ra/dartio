# Cycle 30 — Phase 3 Closure and Sandbox Promotion

Status: closed 2026-08-12 on Production evidence.

Final cycle of `PHASE_3_promise_completion.md`. The seven implementation cycles
are live. This closure does two things that cannot be replaced by another claim:
it removes the last public copy that still describes shipped Pro capabilities as
future work, and it uses Stripe's real Sandbox Checkout path to prove a one-use
100%-off subscription all the way through webhook authority and cancellation.

## Product and billing contract

- Availability data is the source of truth for product claims. Advanced
  checkout, deep statistics, and online rooms are implemented; pricing and
  account surfaces say so. Custom practice and Club administration remain
  unavailable and stay visibly separate from shipped practice drills and rooms.
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

- [x] Replace stale account, pricing, and landing claims with availability-
  accurate copy; preserve the deliberate Club-management and custom-practice
  coming-soon boundaries.
- [x] Lock the Hosted Checkout promotion contract in deterministic tests:
  customer-entered codes enabled, normal payment-method collection retained,
  and no undisclosed discount injected by Dartio.
- [x] Add focused three-viewport browser proof for the corrected landing,
  pricing, and account truth; retain the existing full responsive matrix as the
  broader release gate.
- [x] Provision and redeem one short-lived, one-use, Pro-product-only 100%-off
  code in Stripe Sandbox through real Dartio Production Checkout; record object
  identities only, never the code, key, cookie, or payment details.
- [x] Prove the next full invoice has a non-zero Pro gross amount, an equal
  discount, and zero due; prove the signed webhook grants canonical Pro access;
  pass paid AI and paid voice against Production.
- [x] Cancel through the Stripe Customer Portal, prove the cancellation webhook
  projects the end state, and ensure the single-use promotion cannot be reused.
- [x] Pass full local deterministic/browser gates, independent audit, one exact-
  head PR/CI/Preview, merge, main CI, standing Production verifiers, touched and
  full Production browser matrices.
- [x] Re-score every Phase 3 promise against `main`, archive Cycles 23–30 only
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
  still labels advanced checkout, deep statistics, custom practice paths, and
  online rooms `COMING SOON`, even though the availability contract marks the
  first, second, and fourth implemented. Custom practice correctly remains
  `coming_soon`. The landing source comment likewise denies shipped live rooms.
- Stale PR #30 contains only one still-useful test change plus superseded Cycle
  25 documentation. It will not be merged wholesale; the small contract test is
  re-derived on this branch and the stale PR is closed after replacement.

Local candidate, 2026-08-12:

- Landing now names online rooms as shipped. Pricing names advanced checkout,
  deep statistics, and online rooms as available while leaving custom practice
  and Club visibly unavailable. The signed-in account derives deep statistics
  and online rooms from both availability and entitlement instead of a hard
  claim; its residual copy names only custom practice and Club.
- The billing policy test proves normal Pro Checkout is subscription mode with
  its one configured price, customer-entered promotion codes enabled,
  `payment_method_collection: "always"`, no Dartio-authored `discounts`, and
  matching Checkout/subscription ownership metadata.
- `pnpm typecheck` and full `pnpm lint` exited 0. Focused billing/access tests
  passed 57/57. Full unit proof passed 963 with only the separately opt-in live
  rollback test skipped by design.
- Focused product-truth/account browser proof passed 6/6 over 390×844,
  834×1112, and 1440×1000. The full fresh-build matrix collected 333 checks,
  passed all 329 runnable checks, retained four intentional viewport skips, and
  exited 0 in 287.7 seconds. Full-page pricing inspection at all three widths
  found no clipping, overflow, or status/CTA collision; temporary images and the
  local server were removed afterward.
- The ignored local environment and `vercel env run -e production` both keep
  Stripe credentials unavailable to local processes while exposing the safe
  catalog price identifiers. No coupon, promotion code, Checkout Session,
  subscription, or payment object was created during that access check, and the
  unrelated dashboard account shown earlier was not used.

Exact-head Preview and CI, 2026-08-12:

- Draft PR #35 at `dbb5b9684f0d923c2804760f2ec515f45b844165`
  passed CI run `31573977798`. Vercel Preview deployment
  `dpl_Du6QP8JwYVtHx8WJHzNWCgBjqWrP` was READY at the same commit.
- Preview authentication, history, room refusal, and the complete browser
  matrix passed against the exact deployment. The browser gate again collected
  333 checks, passed 329, and retained the same four intentional viewport skips.

Stripe Sandbox and paid Production boundary, 2026-08-12:

- Coupon `uRVkTf42` is Sandbox-only, 100%-off forever, restricted to Pro product
  `prod_UtnHmPqRARQRAB`, and capped at one redemption. Promotion object
  `promo_1U3XSGALEz0P7O2hxqHPA97V` is bound to the standing QA customer, capped
  at one, and its human-entered code was never printed or persisted. Both
  objects report `times_redeemed: 1`; both are now invalid for another use.
- Real Production Checkout Session
  `cs_test_b1XDfF84LBgAa3gkyxb9GZf9nGhu6OjdWLypwBlePbC9s7qdqCofz2uAq8`
  completed in Sandbox with `amount_total: 0` and created trialing subscription
  `sub_1U3dXsALEz0P7O2hJBUuRL7H`. The subscription has a payment method, uses
  monthly Pro price `price_1TtzgyALEz0P7O2hBlv1fWHW`, and remains test-mode.
- The prior Production webhook was doubly misconfigured: its signing secret did
  not match Vercel and its event selection omitted the Checkout/subscription
  events the Dartio route consumes. It returned 400 and granted no access. It
  was replaced by Sandbox endpoint `we_1U3dgDALEz0P7O2hpeRj6EFE`, limited to
  `checkout.session.completed` plus subscription create/update/delete; its new
  secret went directly through stdin to the sensitive Production environment
  variable and was never displayed. The old endpoint is disabled.
- Vercel redeployed unchanged Cycle 29 merge
  `6f0c2517cae6d00dd3465ccff68624b52517b51c` as Production deployment
  `dpl_3jHojtdFhtKW2z4Pj5EXMNUZMUKP`; it was READY, aliased canonically, and
  retained exact `main` Git metadata. Replayed event
  `evt_1U3dXtALEz0P7O2hvLLURLSk` received HTTP 200 there. Authenticated
  `/api/access` then returned canonical Pro with advanced AI, hands-free voice,
  and online multiplayer.
- Recurring invoice preview `upcoming_in_1U3dmjALEz0P7O2h1XbilngI` proves the
  discount rather than the trial: EUR 799 subtotal, EUR 799 discount, EUR 0
  total and `amount_due`, on the exact configured Pro price and product.
- Production paid gates both exited 0. AI sampled 25 darts for each of S20, D20,
  T20, outer bull, and inner bull and proved physical/target consistency. Voice
  sent the checked-in synthetic clip and returned exact T20 with finite non-zero
  confidence. Anonymous and malformed requests remained refused.
- Customer Portal scheduled the Sandbox subscription to end exactly at trial
  end, 2026-08-26T14:54:18Z. Stripe kept it `trialing` with
  `cancel_at: 1787756058`, recorded the cancellation at `1786570460`, and left
  `cancel_at_period_end: false` because the explicit `cancel_at` is authoritative.
  Event `evt_1U3jn0ALEz0P7O2hgR2sL6kB` reached the canonical webhook with HTTP
  200. Authenticated `/api/access` retained active Pro through the same
  timestamp and exposes that timestamp as `accessEndsAt`, proving both continued
  trial access and no later full-price renewal.

Final exact-head release and closure, 2026-08-12:

- Final PR #35 head `75f3fac046f5615850b67db9c7052f21991dfd37`
  passed CI run
  [31643265525](https://github.com/ni1ra/dartio/actions/runs/31643265525).
  Its exact Vercel Preview was READY; auth, owner-only history, room refusal, and
  all 329 runnable browser checks passed there with the four intentional skips.
- PR #35 merged as `9764652a23d509c117d2c649790b7b1466dc7d09`.
  Main CI run
  [31643931252](https://github.com/ni1ra/dartio/actions/runs/31643931252)
  completed successfully with typecheck, lint, unit, build, and browser proof.
  Production deployment `dpl_HMwfhm7kpoV4HaHyaiUwgEfqabhH` was READY and the
  canonical `dartioopus46.vercel.app` alias resolved to that deployment.
- Production auth, authenticated history/detail/statistics, room refusal, paid
  AI, and paid voice passed. Voice's first synthetic-provider call did not
  return the required T20 command; one bounded rerun passed. This is recorded as
  provider variance for Phase 4 hardening, not erased from the receipt.
- The first full Production browser run had one infrastructure
  `ERR_ADDRESS_UNREACHABLE` while loading mobile `/account`; three immediate
  direct requests returned 200. One bounded full rerun passed all 329 runnable
  checks with the same four designed skips and exit 0.
- Phase 3 was re-scored against the merge, Cycles 23–30 were archived under
  `past_work/phase_3/`, and the evidence-reconstructed Phase 4 queue was opened.
