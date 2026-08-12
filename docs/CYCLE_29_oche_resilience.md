# Cycle 29 — At-the-Oche Resilience

Status: active on `codex/cycle-29-oche-resilience`.

Seventh cycle of `PHASE_3_promise_completion.md`. Dartio already saves X01 and
Cricket through versioned, runtime-validated envelopes, but round modes still
parse their storage inside a component and drills trust a raw event array. The
app also has no segment error boundaries, screen wake lock, public install
icons, or web app manifest. This cycle closes those specific seams without
claiming an offline application that does not exist.

## Player contract

- Every active local match or drill writes an event log after a recorded dart.
  A render failure never clears that log. The nearest play/practice error
  boundary tells the player that the last saved state remains on this device,
  offers a focused retry, and offers a safe route back to setup or practice.
  It does not promise that an input which had not yet reached storage survived.
- While an unfinished match or drill is visible, Dartio requests a screen wake
  lock when the browser supports it. It releases the lock on completion,
  unmount, or loss of eligibility, and re-requests only after a visible page
  becomes eligible again. Refusal or lack of support never blocks scoring and
  never becomes a false “screen will stay awake” claim.
- Round modes and drills resume only from a strict Zod-validated, versioned
  envelope whose scope agrees with the requested mode, opponent, rules, and AI
  level where those distinctions exist. Unknown versions, malformed darts,
  cross-mode data, completed logs, and ambiguous legacy AI logs are discarded.
  Only legacy data whose identity can be proved from its key and roster is
  migrated.
- Dartio publishes a same-origin standalone manifest and square 192/512 icons,
  including a genuinely mask-safe asset. Installation launches `/` inside the
  `/` scope. Installation availability remains browser/platform policy.

## Offline truth boundary

This cycle adds no service worker, Cache Storage writer, background sync, or
offline route. The manifest makes Dartio installable where the browser accepts
it; it does not make a cold launch, navigation, authentication, AI, voice,
rooms, or history available without a network. Local event logs can survive a
reload on the same browser because they use `localStorage`, but the application
shell must still load from the network and those logs do not synchronize across
devices. Browser proof must assert both the valid manifest and the absence of a
service-worker registration.

That boundary follows the current primary contracts checked on 2026-08-12:

- Next.js 16 serves `app/manifest.ts` as its built-in manifest route:
  <https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest>.
- The Screen Wake Lock API is a secure-context, best-effort capability and a
  granted sentinel may be released by the user agent:
  <https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API>.
- A maskable icon's guaranteed safe zone is the centered circle with radius 40%
  of the image size:
  <https://www.w3.org/TR/appmanifest/#icon-masks>.
- Offline navigation requires an explicit cache/fetch strategy; a manifest by
  itself is metadata, not an offline cache:
  <https://web.dev/articles/service-worker-mindset>.

## Queue

- [ ] Move round and drill resume state into strict versioned Zod stores, bind
  every envelope to its setup scope, and cover safe legacy migration plus
  malformed, unknown-version, cross-mode, completed, and ambiguous data.
- [ ] Wire every round mode and drill to those stores without changing reducer
  truth, AI atomicity, correction, completion filing, or history identity.
- [ ] Add play and practice error boundaries whose recovery copy and controls
  are truthful about the last saved event log and work at all three viewports.
- [ ] Add one lifecycle-safe screen wake-lock hook to every active at-the-oche
  surface and prove request, release, visibility re-acquisition, unsupported,
  refusal, completion, and unmount behaviour.
- [ ] Add the Next.js manifest plus public 192/512 regular and maskable icons;
  verify their MIME type, dimensions, manifest scope/start/display fields, and
  safe-zone design from the built application.
- [ ] Audit offline behaviour mechanically: no service-worker source or
  registration, no Cache Storage claim, same-device saved logs only, and an
  honest online-required statement in the control docs.
- [ ] Pass focused persistence/unit, typecheck, lint, build, three-viewport
  touched browser, complete browser, and independent adversarial gates on one
  frozen candidate.
- [ ] Push one PR, pass exact-head CI and Preview proof, merge the exact green
  revision, then repeat standing verifiers, touched browser, full browser,
  exact deployment, and main CI proof on Production.

## Release safety

There is no schema, database, Stripe, OpenAI, entitlement, or room-lifecycle
mutation in this cycle. Storage migration is client-local and fail-closed; it
never rewrites an unprovable legacy AI identity. The wake lock is capability-
detected and advisory. Rollback is one code deployment because no service worker
or retained platform state is introduced.

## Receipts

Planning inventory, 2026-08-12:

- Branch `codex/cycle-29-oche-resilience` starts from exact Cycle 28 Production
  merge `29aa289bb2c5ee44e574017fccc0d457acfedd71`.
- The pre-change app has no `public/` directory, `manifest.ts`, `error.tsx`,
  `global-error.tsx`, wake-lock request, service-worker registration, or Cache
  Storage writer. It has one file-convention `src/app/icon.svg`.
- X01 and Cricket already use strict versioned stores. Round resumes through
  component-local `JSON.parse` plus partial replay checks; drill resumes from a
  raw object with only an array check. Those are the scoped persistence debts.
- Cycle 28 closure documentation is carried on this branch because the shipped
  PR cannot contain evidence produced after its merge.

Local, Preview, CI, merge, and Production receipts remain open until their
exact commands finish.
