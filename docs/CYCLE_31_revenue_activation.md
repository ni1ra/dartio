# Cycle 31 — Revenue Activation and Bank Payout

Status: active on `codex/cycle-31-revenue-activation`.

Phase 3 proved Dartio billing end to end in Stripe Sandbox. The operator has now
explicitly authorized Live activation, a real sub-NOK-100 purchase, and use of
the primary bank payout account. This cycle proves that a customer payment can
become canonical Dartio access and then money available to the operator, without
leaking identity or payment data into the repository or logs.

## Contract

- Stripe remains the only payment and payout authority. PayPal, Nordea, and a
  custom money ledger are not added while the primary Stripe-to-bank route works.
- Operator identity, address, phone, bank account, card data, verification
  documents, keys, cookies, and webhook secrets exist only in Stripe/Vercel's
  secure interfaces. They are never copied into source, docs, shell arguments,
  screenshots, or tool output.
- The Live account, legal entity, country, settlement currency, capabilities,
  statement descriptor, support/contact details, and payout destination must be
  complete before Dartio accepts a Live purchase.
- Live Pro monthly/annual catalogue objects mirror the public EUR prices and the
  Sandbox ownership metadata. Club stays unavailable; no test product is exposed
  as a Dartio offer.
- The Live webhook listens only to Checkout completion and subscription
  create/update/delete. Its signing secret goes directly into the sensitive
  Production environment and is verified by one real signed delivery.
- Environment cutover is reversible: inventory current variable names/scopes,
  preserve the last Sandbox deployment as rollback, update all Live key/price/
  webhook values together, redeploy once, and refuse mixed test/live objects.
- The proof purchase is an actual Pro subscription below NOK 100 at the public
  price. The operator enters the payment method directly in Stripe Checkout.
  Entitlement, invoice, Portal state, Stripe balance, payout status, and bank
  arrival are proven without printing customer or bank details.

## Queue

- [ ] Read current Stripe primary documentation for account activation, Live
  Checkout/subscriptions, webhooks, refunds/cancellations, balances, and payouts;
  freeze the exact operational sequence and rollback.
- [ ] Confirm the signed-in Stripe account is the Dartio integration's account;
  inspect Live activation/capability/requirements status without exposing PII.
- [ ] Complete provider-hosted business verification and connect the primary bank
  payout destination. Record only capability booleans and safe provider object
  IDs.
- [ ] Inventory Production billing environment names/scopes and current Sandbox
  catalogue/webhook state without reading secret values into logs.
- [ ] Create or verify the Live Dartio catalogue and narrow Live webhook; install
  all Live Production values atomically and redeploy the exact candidate.
- [ ] Pass anonymous/error billing boundaries, standing auth/history/rooms gates,
  and one real Pro Checkout entered by the operator. Prove invoice/payment state,
  signed webhook access, paid AI/voice, and Customer Portal lifecycle.
- [ ] Prove the net amount appears in Stripe's available balance and a payout to
  the verified bank destination succeeds. Do not mark this item complete for a
  merely pending or estimated payout.
- [ ] Pass deterministic and three-viewport browser gates, PR CI, exact-head
  Preview, merge, main CI, exact-SHA Production regression, then archive this
  cycle only when the bank payout receipt is terminal.

## Safety and rollback

No destructive database operation is involved. Before changing Production
billing variables, record names/scopes and the last known-good Sandbox-backed
deployment; never print values. If Live checkout or webhook projection fails,
restore the prior environment set and promote the prior deployment, then rerun
auth/history/rooms before diagnosing further. A payment is not retried blindly:
Stripe object state is read first so an outcome-unknown response cannot create a
duplicate charge. Refunds and cancellations are separate actions and are never
used merely to make a failed proof look clean.

## Receipts

Planning baseline, 2026-08-12:

- Branch `codex/cycle-31-revenue-activation` starts from clean Phase 3 merge
  `9764652a23d509c117d2c649790b7b1466dc7d09`.
- Sandbox has already proven customer-owned Hosted Checkout, a one-use 100%-off
  promotion, a zero-due recurring invoice, signed webhook entitlement, paid AI
  and voice, and Portal cancellation. Those objects remain test-mode evidence;
  none is counted as Live revenue or a bank payout.
- The operator explicitly authorized a real transaction below NOK 100 and supplied
  identity and payout data in the secure session. No such data is reproduced here.
