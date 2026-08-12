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
  including a genuinely mask-safe asset. Installation launches `/play` inside the
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

- [x] Move round and drill resume state into strict versioned Zod stores, bind
  every envelope to its setup scope, and cover safe legacy migration plus
  malformed, unknown-version, cross-mode, completed, and ambiguous data.
- [x] Wire every round mode and drill to those stores without changing reducer
  truth, AI atomicity, correction, completion filing, or history identity.
- [x] Add root and match error boundaries whose recovery copy and controls are
  truthful about the last saved event log and work at all three viewports.
- [x] Add one lifecycle-safe screen wake-lock hook to every active at-the-oche
  surface and prove request, release, visibility re-acquisition, unsupported,
  refusal, completion, and unmount behaviour.
- [x] Add the Next.js manifest plus public 192/512 regular and maskable icons;
  verify their MIME type, dimensions, manifest scope/start/display fields, and
  safe-zone design from the built application.
- [x] Audit offline behaviour mechanically: no service-worker source or
  registration, no Cache Storage claim, same-device saved logs only, and an
  honest online-required statement in the control docs.
- [x] Pass focused persistence/unit, typecheck, lint, build, three-viewport
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

Preview, PR CI, merge, and Production receipts remain open until their exact
commands finish.

Frozen local candidate, 2026-08-12:

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all exited 0. The production
  build generated all 23 static pages and dynamic route entries, including
  `/manifest.webmanifest` and the exact `/play/match` error segment.
- `pnpm test` exited 0 with 63 files and 963 passing tests. The only skip is the
  explicitly opt-in isolated-Neon rollback proof from Cycle 28; no ordinary
  unit test was skipped.
- The focused manifest, recovery, hydration, round-store, and drill-store gate
  passed 48/48. It includes strict current and legacy formats, safe migrations,
  local-storage failures, nonempty-to-empty cleanup, mask-safe pixels, and the
  real error-boundary components.
- `pnpm exec playwright test tests/browser/resilience.spec.ts` passed 42/42 at
  390x844, 834x1112, and 1440x1000. It proved wake-lock lifecycle and late
  grants, scoring without the capability, resume cleanup, future-format
  preservation, already-loaded offline scoring, manifest/icon delivery, zero
  service workers, and responsive recovery controls.
- The complete unpiped `pnpm test:browser` gate collected 330 checks: 326 passed
  and four intentional layout checks skipped, exit 0 in 277.9 seconds. It used
  one fresh production build and left no listener on port 3100.
- Independent source audit found and closed four candidate defects before
  sign-off: stale empty-log resurrection, throwing `localStorage` getters,
  a pending wake-lock visibility race, and order-dependent deletion of future
  raw-v1 round/drill formats. The frozen re-audit found no release blocker.

Preview, PR CI, merge, and Production receipts remain open. No database,
Stripe, OpenAI, entitlement, or service-worker state was changed locally.

PR #34 Preview candidate `9b225dea8c280aea77b62d83ca3647bf940774f9`,
2026-08-12:

- GitHub Actions run
  [31559456222](https://github.com/ni1ra/dartio/actions/runs/31559456222)
  passed dependency installation, typecheck, lint, unit, build, and the full
  browser proof in 7m57s on the exact head SHA. Both Vercel checks also passed.
- Vercel deployment `dpl_968gSJyRd25Y13Sph56k4F6kuwQx` was READY with target
  `preview`, PR 34, build `bld_d69kyc0bt`, no access protection, and the exact
  head SHA. Its immutable URL was
  `https://dartio-c54bbycvs-niras-projects-868b6f5f.vercel.app`.
- `pnpm verify:auth` accepted the immutable origin. A throwaway Preview identity
  authenticated; `verify:history` filed and read one strict D20 record, derived
  the Free headline while withholding `deep`, and proved anonymous history,
  detail, and statistics refusal. The room sweep proved every anonymous route
  returns 401 and that the Free identity receives 402 before a room exists.
- The deployed resilience surface passed 42/42 in 22.7 seconds. The complete
  deployed matrix collected 330 checks and passed 326 with the four designed
  viewport skips in 2.9 minutes, exit 0, at 390x844, 834x1112, and 1440x1000.
- The immutable origin existed in Preview Neon Auth only for those probes:
  its exact count moved 0 to 1 to 0. The pre-existing stable Cycle 2 origin
  remained at count one, and no Production credential was sent to Preview.
