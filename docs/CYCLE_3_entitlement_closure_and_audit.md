# Cycle 3 — Entitlement Closure and Total Gap Audit

Status: closed 2026-07-28

Derived from: `PHASE_1_v1_foundation.md`, closing the last open row of
`past_work/phase_1/CYCLE_2_identity_billing_voice.md`.

## Slice

- [x] Move the working checkout onto a filesystem the toolchain can actually use.
- [x] Authorize every paid promise at its server consumer rather than in the client.
  - [x] Gate `POST /api/voice/transcribe` on `voice_always_on` before the body is read or an OpenAI client exists.
  - [x] Gate `POST /api/ai/turn` on `advanced_ai` for levels 9–20 and keep 1–8 local so Free play never needs the network.
  - [x] Split Free basic checkout from server-authorized advanced routes, setup plans, and preferences.
  - [x] Close Club Checkout in the catalog, the checkout route, and the pricing surface without touching existing subscribers.
  - [x] Keep local Free scoring usable through an access-authority outage.
- [x] Audit the whole product against the spec and the phase plan, and write the gaps down with evidence.
- [x] Archive Cycles 1 and 2 with an honest carry-forward rather than a clean-looking closure.

## Verified receipts — 2026-07-28

- **Working checkout moved to WSL.** On `/mnt/c` pnpm aborts its modules-directory
  check with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` and every install and
  build pays the DrvFs penalty. The same tree at `/home/nira/dev/dartio` installs
  in 13 s and builds in about 30 s. The Windows copy is retained read-only;
  `REPO_CONTROL.md` records both paths. The stale `n1ira/dartio` remote on the
  legacy `dartio_opus_4.6` checkout was also repaired — that account renamed to
  `ni1ra`, so it had been failing every fetch.
- **Advanced checkout is now a server product.** `basicCheckoutAdvice` gives Free
  one ranked route computed locally; `POST /api/checkout/advice` gives entitled
  players alternates, setup-visit plans, and preference ranking. The free path
  also skips the exhaustive setup walk, which is the expensive half of the
  planner. The companion renders the local route immediately and upgrades in
  place, so a denial, an outage, or a slow response never blocks scoring.
- **`ProductAvailability` was widened** from today's literal values to
  `Record<key, AvailabilityState>`, so "entitled but not shipped" is a state the
  type system admits. It previously narrowed to `"implemented"`, which made the
  unshipped-feature branch look like dead code.
- Local gates: TypeScript clean, ESLint clean at `--max-warnings=0`, 314 tests
  across 25 files (from 284), production build with 19 routes.
- New coverage proves anonymous 401, authenticated-Free 403, entitled-but-unshipped
  403, indeterminate-authority 503, sanitized 500, rejection of unknown request
  keys such as a client-supplied `entitlements` array, refusal of a tampered
  route rather than rendering it, and free/paid primary-route parity across every
  double-out score from 2 to 170.
- GitHub CI run `30318809992` passed on `71d8de7`.
- **Browser sweep** at 390×844, 834×1112, and 1440×1000 across `/`, `/play`,
  `/play/match`, `/practice`, `/friends`, `/pricing`, and `/account`: zero
  horizontal overflow and zero console errors on all 21 combinations. The
  entitlement work was confirmed visually — the checkout companion shows its Pro
  note and the voice panel shows its locked state for a signed-out player.
- **Gap audit** written to `docs/artifacts/GAP_AUDIT_2026-07-28.md`: sixteen
  ranked gaps, each measured against code at `71d8de7` or in a real browser, plus
  four corrections to `FUNCTIONAL_RECON_2026-07-17.md` where that document had
  gone stale. Every gap is assigned to a Phase 2 cycle.
- The regulation dartboard renderer, SVG geometry, board selectors, and
  coordinate contract were not touched in this cycle.

## Acceptance proof

- A signed-out player can open a match, score a full visit locally, and see one
  ranked checkout route, with the paid surfaces honestly locked rather than
  hidden or silently degraded.
- No paid feature can be reached by a client that merely renders its controls:
  voice, AI 9–20, and advanced checkout each fail closed at their own server
  consumer against the server's own access snapshot.
- Every remaining gap between what Dartio claims and what Dartio does is written
  down with the evidence that found it.
