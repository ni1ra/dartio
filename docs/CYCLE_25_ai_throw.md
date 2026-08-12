# Cycle 25 — Premium AI, Rules-Blind

Status: shipped to Production on 2026-08-11 in PR
[#29](https://github.com/ni1ra/dartio/pull/29). The exact Preview proved the paid
provider path with a legitimate Sandbox-created Pro identity; the separate
Production paid-QA receipt remains parked because the standing QA identity is
Free.

Third cycle of `PHASE_3_promise_completion.md`. Levels 9–20 become playable in
X01, Cricket, Around the Clock, Shanghai, Count-Up, and Bob's 27 without moving
any mode rule to the server. What paid access authorizes is execution quality:
the client chooses one legal scoring bed from its temporary reducer state, and
the server samples one physical landing for that `{ level, target }`.

## The boundary

`POST /api/ai/throw` accepts exactly one integer level from 9 through 20 and one
target `{ segment, multiplier }`. It rejects a miss as an aim, a treble bull,
extra mode/rule/match/access fields, and client-controlled randomness. The route
resolves the canonical access snapshot and requires all three server facts:
`advanced_ai`, an `aiMaxLevel` at least as high as requested, and an implemented
product flag. Levels 1–8 never use this route.

Success is exactly `{ dart }`. The client verifies the score, bed constraints,
finite coordinates, and the result of scoring those coordinates again through
the regulation board. The response does not disclose the requested aim, error,
access record, plan, or identity. This is authorization of an execution sample,
not match authority: the client still owns tactics, turn order, and whether a
landing is legal in the current game.

## One visit, one commit

The next target can depend on the previous landing. Cricket may close a number;
Around the Clock may advance; X01 may open, bust, or finish. A premium visit is
therefore three sequential requests at most, never a parallel batch. Each
landing is applied only to a temporary reducer state. The authoritative event
log receives one array only after the visit finishes, hands the turn back, or
ends the match. If request two fails, no dart from request one is recorded.

The visit collector captures the starting turn/visit boundary, not merely the
current seat. That prevents a one-dart X01 leg win from spilling into a new leg
when the same player starts it. Its scheduler owns the delay and one
`AbortController`; retry starts from the current log, while correction, undo,
rewind, navigation, and unmount invalidate any stale completion.

## Access and recovery

Every opponent mode reads requested levels 1–20. Levels 1–8 stay deterministic
and local. A requested 9–20 runs remotely only after the current browser access
snapshot authorizes it. An unentitled or unavailable initial snapshot falls back
honestly to local level 8; once that fallback completes an AI visit, the match
locks to 8 rather than silently upgrading after a later access refresh. A failure
after a premium visit has begun pauses the whole visit with zero mutation and
offers two explicit paths: retry the premium visit from the authoritative log,
or continue the match permanently at local level 8.

The active-match envelope stores that continuation and the distinct execution
levels that actually completed AI visits. Reload therefore keeps the chosen
quality. Completed history records the one level when every AI visit agrees and
omits a level when a premium-to-local match genuinely contains both; it never
labels mixed execution as one level.

The six opponent modes are reachable from `/play`; practice links remain solo.
The mode picker is a select because six nowrap segments do not fit at 390 px.
Cricket and all four round-mode opponent URLs carry the selected level, just as
X01 does.

## Queue

- [x] Split mode-neutral execution from X01 policy; add the strict throw route,
  canonical authorization, physical client validation, and remove the
  superseded `/api/ai/turn` boundary.
- [x] Share one sequential, atomic visit collector and one cancellable async
  scheduler across X01, Cricket, and the round-mode surface.
- [x] Make X01 production and benchmark use the same rule-aware target policy;
  recompute Cricket and round targets through temporary reducer state; advance
  Around the Clock inside the visit.
- [x] Give all six opponent modes levels 1–20, identical entitlement/recovery
  behavior, honest effective-level history, and setup reachability at 390, 834,
  and 1440 pixels.
- [x] Prove all six premium target sequences, sequential request order, atomic
  third-response commit, dart-two failure, retry, local level-8 continuation,
  cancellation, and zero local network calls in the browser.
- [x] Add an application-data-safe `pnpm verify:ai:live <deployment-url>` gate. It signs in
  an existing QA identity without printing credentials, proves anonymous and
  malformed refusals, samples representative premium target families, checks
  physical self-consistency, statistically distinguishes the requested segment
  and multiplier, checks `private, no-store`, and fails rather than pretending
  success when that identity is not genuinely entitled. Sign-in creates the
  ordinary auth session required to exercise the boundary; it creates no account,
  match, billing row, product row, or database access path.
- [x] Full local typecheck, lint, unit, build, and browser gates.
- [x] Exact Preview deployment: authentication, premium live verifier, touched
  browser matrix, CI, and origin cleanup.
- [x] Merge the green exact revision; prove exact main CI and the exact READY
  Production deployment.
- [ ] Repeat the paid live sampler on Production when a legitimate entitled QA
  identity exists. A 403 from the current Free identity remains a refusal, not
  success evidence.

## Resume boundary

Cycle 25 gives X01, Cricket, and the round modes a v2 active-match envelope. Its
key distinguishes solo/local play and each requested AI level; its metadata
persists level-eight continuation and the levels actually executed. Safe v1
solo and roster-proven local logs still resume into v2. Existing v1 AI logs did
not store a requested or effective level, so they cannot be migrated truthfully
and start fresh once after this release; the old local data is not deleted.

Cycle 29 still owns the broader versioned-Zod treatment for round modes and
drills, corruption UX, and offline/resilience audit. This cycle adds only the
metadata required to keep opponent authority and history honest.

## Receipts

Exact local candidate, 2026-08-11:

- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0, zero warnings.
- `pnpm test` — 51 files, 723 tests passed, exit 0.
- `pnpm build` — 22 static pages generated; route manifest contains
  `/api/ai/throw` and no `/api/ai/turn`; exit 0.
- `pnpm test:browser` — 231 checks at 390×844, 834×1112, and 1440×1000;
  227 passed and 4 viewport-inapplicable assertions skipped by design; exit 0
  in 252.5 seconds.
- Fresh-context static audit found no remaining blocking product, authorization,
  secret-handling, async, atomicity, or mode-rule leak after the persistence and
  statistical-verifier corrections.
- PR #29 candidate `a72d52a` deployed as
  `dpl_HVzmaXALkcQKy6PHGXRFoG1fhXwv` at
  `https://dartio-qq215pjc3-niras-projects-868b6f5f.vercel.app`; Vercel and
  GitHub CI run `31472630526` passed on that exact revision.
- `pnpm verify:auth <preview>` — the temporary origin reached Neon Auth
  validation instead of `INVALID_ORIGIN` (status 400), exit 0.
- A disposable Preview identity obtained genuine Pro authority through Stripe
  Sandbox Checkout: 14-day annual trial, EUR 0 due, then cancellation scheduled
  before any charge. Its first webhook deliveries exposed the old Cycle 2
  endpoint's stale post-rotation database credential (four HTTP 500s). Redeploy
  `dpl_FfHXJZ9ZJJk7mWoDGiqieGx6LWCq` retained the branch-scoped signing secret,
  loaded the current Preview database URL, accepted two fresh signed deliveries
  with HTTP 200, and `/api/access` returned Pro, `advanced_ai`, and level 20.
- `DARTIO_QA_EMAIL=<disposable-preview-identity> pnpm verify:ai:live <preview>` —
  anonymous refusal, authenticated authority, 25 physical darts centered on
  each of S20, D20, T20, outer bull, and inner bull, plus all four strict-body
  refusals; exit 0 in 39 seconds.
- `DARTIO_BASE_URL=<preview> pnpm exec playwright test
  tests/browser/mode-ai.spec.ts` — 75/75 passed across mobile, tablet, and
  desktop; exit 0 in 63.1 seconds.
- The exact Preview origin was removed from Neon Auth after verification; a
  readback showed only the pre-existing stable Cycle 2 origin.
- A browser diagnostic reflected the dedicated QA app password in tool output.
  It was treated as compromised immediately: both isolated Neon Auth identities
  returned HTTP 200 from password rotation, other sessions were revoked, and
  ignored `.env.local` was updated without placing the replacement in source,
  a command argument, or subsequent output.

Merge and Production, 2026-08-11:

- PR [#29](https://github.com/ni1ra/dartio/pull/29) merged as exact commit
  `a4c959a805e61bcbcf299707f3c687d0629464a9`.
- Main GitHub Actions run
  [31519353985](https://github.com/ni1ra/dartio/actions/runs/31519353985)
  completed successfully on that exact SHA. Typecheck, lint, unit, build, and
  the 231-check browser matrix all passed: 227 run and four intentional skips.
- Vercel deployment `dpl_Gj5BUEKa9tHMhjbmM35jViBkCZa6` reached READY for the
  same SHA, target Production, with no alias error. A canonical-alias lookup of
  `https://dartioopus46.vercel.app` resolved to that deployment and SHA.
- The later Cycle 26 Production gate authenticated the standing QA identity
  against the unchanged premium-AI boundary and received 403 because the
  account is Free. This is recorded as the outstanding paid-Production receipt;
  no fake subscription or database authority was added.
