# Cycle 37 — Credibility Closure

Status: active on `codex/cycle-37-credibility-closure`.

Cycle 37 is the phase audit, not a new feature commission. It compares every
public promise with the code and the canonical Production behaviour, closes the
remaining commercial proof, repeats the standing release matrix, and archives
Phase 4 only when the evidence is terminal. A claim with an open provider gate
stays open even when all repository tests are green.

## Claim ledger

| Public promise | Product authority | Current evidence | Verdict |
| --- | --- | --- | --- |
| Correct X01, Cricket, Around the Clock, Shanghai, Count-Up, Bob's 27, and focused practice rules | Mode reducers, strict persisted records, setup links, replay | Domain suites plus the complete three-viewport browser matrix exercise every scoring family | supported |
| AI opponents from level 1 through 20 with progressively stronger, believable throws | `ai-throw`, mode policy adapters, server-authorized premium sampler | Local policy/benchmark suites, paid route verifier, and Production browser stories | supported |
| Fast local and reconnectable server-authoritative friend play | Local reducers plus room lifecycle/version authority | Room live verifier, integrity audit, and Cycle 35 loss/retry/terminal-race stories | supported |
| A visual board that records, explains, and replays every exact stored dart without inventing aggregate coordinates | Strict match records and replay timeline | Cycle 27 exact/aggregate/bust/new-leg tests and Production replay stories | supported |
| Push-to-talk and opted-in hands-free scoring with visible lifecycle, correction, and stale-result protection | Shared voice controller, dialogue queue, mode adapters | Voice route verifier and browser stories across every eligible scoring surface | supported |
| Checkout guidance with routes, alternatives, setup shots, bogey warnings, and history-aware personalization | Rules engine plus server-authorized aggregate finishing evidence | Cycle 33 domain/API/browser and Production access verification | supported |
| Clear Pro value, hosted Stripe billing, self-service management, and no dark patterns | Availability map, Checkout/Portal routes, signed webhook projection | Sandbox purchase/discount/invoice/Portal proof is complete; Live activation, payment, and terminal bank payout remain open in Cycle 31 | **open** |
| A striking, usable UI at 390×844, 834×1112, and 1440×1000 | Navi UI surfaces and shared responsive styles | Full browser release matrix, Cycle 36 accessibility gate, reduced-motion checks, and measured delivery budgets | supported |

## Pricing ledger

The current pricing surface is intentionally narrower than the entitlement
catalogue. Free local scoring, level-8 AI, history, and replay are available.
Pro advertises only shipped AI 1–20, both voice modes, advanced checkout,
statistics, rooms, and custom practice. Club management, league tables, shared
boards, and Club checkout remain explicitly `COMING SOON`; no payment action is
enabled for them.

The listed EUR prices, 14-day Pro trial, promotion-code support, automatic-tax
request, and Portal cancellation are mechanically covered in Sandbox. They do
not become a Production revenue claim until Cycle 31 proves the Live catalogue,
signed webhook, customer-visible Checkout/Portal lifecycle, available balance,
and terminal bank payout.

## Queue

- [x] Close Cycle 36 on exact-SHA Preview, CI, merge, Production probes, full
  browser matrix, and bounded runtime-log inspection.
- [ ] Finish Cycle 31 in the provider-owned Live account: approved business and
  payout profile, Live catalogue/webhook/environment cutover, one operator-paid
  Pro subscription below NOK 100, signed entitlement, Portal cancellation, and
  a terminal payout at the verified bank destination.
- [ ] Repeat auth, history, rooms, room integrity, paid AI, paid voice, and the
  complete three-viewport Production browser matrix on the final Phase 4 SHA.
- [ ] Re-read the manifesto, pricing, account, landing, availability map, and
  control document after the final deployment; downgrade or remove any claim
  whose evidence no longer matches.
- [ ] Close `PHASE_4_credibility_campaign.md`, archive Cycles 31–37 under
  `docs/past_work/phase_4/`, and leave a concrete post-v1 backlog with named
  outcomes rather than a new invented phase.

## Post-v1 backlog boundary

These are not hidden Phase 4 failures and must not be rewritten as shipped:

- Club membership administration, league tables, shared-board operations, and
  Club checkout.
- A generic custom-drill language beyond the shipped finite bed-sequence builder.
- Offline cold start/navigation or service-worker-backed synchronization; only
  an already-loaded local match can continue without the network.
- Physical deletion of expired room rows without a recoverable archive and
  separate destructive-operation authority.
- Provider-independent calibration of voice log-probability confidence; the
  shipped floor is a fail-closed product policy, not a correctness probability.

## Receipts

Cycle 36 release receipt, 2026-08-13:

- PR #41 final head `a17fc3d4c34989c55a0dd03986c3c684df9bd77e`
  passed CI run `31668118954`, exact-head Preview, and the complete 455-run / four-
  skip browser matrix. It merged as `e52c1f8671b728c04ed8cd556ce8bc661bf73118`.
- Main CI run `31668637443` passed. Production deployment
  `dpl_2C7EGdcNAEAD87SZo7Q1sWyAFmWx` is READY on that exact merge SHA, and auth,
  history/detail/statistics, rooms, room integrity, paid AI, paid voice, the
  complete three-viewport browser matrix, and bounded runtime-log inspection
  all passed.
- The strengthened public-claim story passed 3/3 directly against canonical
  Production. It verifies the landing signal, Free history/replay, every shipped
  Pro capability, promotion-code support, hosted-Stripe assurance, and the
  disabled/no-charge Club boundary at 390x844, 834x1112, and 1440x1000.

Live-cutover release preparation, 2026-08-13:

- PR #43 made a Sandbox customer reference self-heal when the active Live
  account reports the exact resource as missing. It merged as
  `0516826a6683462df67c7663e47a619f514ebabd`.
- PR #44 removed the stale local Sandbox-subscription projection from the
  pre-Checkout authority check; only subscriptions returned by the active
  Stripe mode can block a new Checkout. It merged as
  `70723231d4a6cbfc74291217e69e5809c6558637`. Main CI run
  `31670699278` passed typecheck, lint, 1,037 unit tests plus one designed live-
  database skip, build, and the complete browser job. Production deployment
  `dpl_HfwydzpZTvtn2sQTAHfrVczV1jGf` is READY on that exact SHA with no alias
  error. It remains Sandbox-backed until the provider-authenticated Live key and
  `STRIPE_MODE=live` are installed together and a fresh deployment proves them.
- The pre-cutover evidence head
  `9a8f26ee5f1bdcd08d490cb92ffe08d7c756bc29` passed CI run `31671843422`
  including its browser job. Exact-head Preview deployment
  `dpl_9Y6NGcvTemZRtNGArtD2AmauQJBN` is READY, and the public-claim story passed
  3/3 there at 390x844, 834x1112, and 1440x1000. PR #42 deliberately remains
  draft and open until the bank payout is terminal.

Cycle 31's terminal Live payment/payout receipt remains the phase gate. This
cycle stays active and the Phase 4 archive remains unclaimed until that bank
receipt is terminal.
