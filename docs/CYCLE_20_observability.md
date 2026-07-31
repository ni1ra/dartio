# Cycle 20 — Observability, Analytics, Rollback

Status: active

The last open line from `PHASE_1_v1_foundation.md`: "Implement observable error
handling, analytics events, and rollback paths." None of the three existed. There
was also one known unfixed defect carried since Cycle 10, and it is fixed here.

## No agent, no key, no dependency

`src/lib/server/observability.ts` writes one line of JSON per event to stdout,
which Vercel captures. That is real observability at the cost of nothing: no
third-party agent, no API key to rotate, and no request made to somebody else's
servers on a player's behalf. If a log drain is added later it reads these
unchanged.

**The field list is an allow-list rather than a spread**, and that distinction was
found by a test rather than reasoned about. The first version spread the caller's
object, so the types forbade an email or a token but nothing enforced it — and a
type is not a runtime guarantee. The test reaches past the types with an `email`
and a `token` and asserts neither survives. Now neither does.

A failure's reason is taken from the error rather than from the caller, because a
message written at the call site drifts from what actually went wrong. It goes to
the log and never to the response; the routes already answer with fixed codes.

## A 500 that should always have been a 503

`/api/auth/get-session` answered 500 when Neon Auth's upstream was unreachable,
where every route Dartio owns answers a deliberate 503. That difference is not
cosmetic: **a 500 says Dartio is broken and a 503 says an authority is temporarily
unavailable**, and only the second is true during a Neon outage. The access client
already treats 503 as "carry on with local free play", which is the right outcome —
nothing about scoring a match needs an account.

The proxy converts both an exception and an upstream 500. Everything else passes
through untouched: a wrong password, an untrusted origin and a validation refusal
are the auth service's answers to give, and eight tests assert it does not touch
them.

## A rollback path that is a procedure

"Vercel retains prior ready production deployments" was a fact, not something
anybody could follow at three in the morning. `REPO_CONTROL.md` now carries four
ordered steps: confirm it is the deployment before rolling back at all, promote the
last good one, leave the database alone unless the migration is the fault — every
migration this phase shipped is additive, so older code ignores the new columns —
and re-verify afterwards, because a rollback nobody checked is just a second
unverified deployment.

It also names what promoting a deployment cannot undo: Neon Auth trusted domains,
Stripe configuration, and anything applied through the Neon control plane.

## On "analytics"

What is here is a product-event vocabulary on the same channel as the errors —
a room opened, a version conflict, a match that failed to record. What is
deliberately *not* here is a third-party analytics SDK: it would be a dependency,
a key, and a request made on a player's behalf, for numbers nobody has asked a
question of yet. The events exist so that a question can be asked; a vendor can be
chosen when there is one.

## Verified receipts — 2026-07-31

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **547 tests across 44 files**, up from 535 across 42. Build green.
- Cycle 19's layout fix confirmed on production the same way it was diagnosed:
  document height **1000 px in a 1000 px viewport**, command dock ending at 1000.
