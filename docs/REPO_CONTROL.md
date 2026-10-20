# Dartio Repository Control

## Canonical identity

- Local path: `\\wsl.localhost\Ubuntu-24.04\home\nira\projects\dartio` (WSL: `/home/nira/projects/dartio`)
- Prior local paths, both dead: `/home/nira/dev/dartio`, moved during a machine-wide reorganization on 2026-07-28; and `C:\Users\nira\Documents\Codex\2026-07-17\rec\dartio`, retained read-only. The checkout stays WSL-native wherever it moves, because pnpm on `/mnt/c` aborts its modules-directory check without a TTY and pays the DrvFs IO penalty on every install and build; the same install takes 13 s in WSL.
- GitHub target: `https://github.com/ni1ra/dartio`
- Vercel project: `dartio` (`prj_tYySUSn7wfIjqFQA1KZsVJtDbLIM`)
- Product version: `1.0.0`
- UI dependency: Navi UI `1.0.0`
- Git author: `ni1ra <andreashoug@gmail.com>`. The address is what attributes a commit to the `ni1ra` GitHub account; the name had drifted to `andreashoug` and `Andreas` across earlier commits because Windows and WSL hold separate git configs. History is left as it stands — rewriting nine cycles of shared commits to fix a display name is not worth it.

## Operating facts

- This repository is greenfield. Never copy legacy Dartio source.
- Database: Neon project `dartio`, project `nameless-tooth-63658537`, branch `br-sweet-wildflower-afy2ygj6`, database `neondb`.
- Preview database branch: `vercel-preview` (`br-fragrant-art-af79dyw5`); Neon Auth is provisioned independently on main and preview.
- Neon Auth preview trusted domains include the stable Cycle 2 Vercel PR alias `https://dartio-git-cycle-2-identity-bill-2c0634-niras-projects-868b6f5f.vercel.app`; a fresh sandbox sign-up and authenticated `/account` projection passed there on 2026-07-17.
- Hosting: Vercel team `niras-projects-868b6f5f`.
- Payments: claimed Stripe sandbox `dartio-stripe`, resource `ir_afV2OHhg6q9l9S78`, connected to Preview and Production. The canonical Sandbox subscription-projection endpoint is `we_1U3dgDALEz0P7O2hpeRj6EFE` at `https://dartioopus46.vercel.app/api/billing/webhook`; it receives only Checkout completion and subscription create/update/delete. Its signing secret exists only as Vercel's sensitive Production `STRIPE_WEBHOOK_SECRET`. The superseded endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF` was disabled on 2026-08-12 after an exact request-log audit proved that a stale secret and unrelated event selection produced HTTP 400 instead of projecting subscriptions.
- Stripe data-plane mode is explicit as of Cycle 31. `STRIPE_MODE=sandbox`
  accepts only an `sk_test_` server key, `STRIPE_MODE=live` accepts only
  `sk_live_`, and the signed webhook rejects any event whose `livemode` flag
  disagrees. Price IDs remain provider-owned opaque IDs; Stripe's own API refuses
  a price from another account or mode.
- Stripe sandbox account: `acct_1TtxM1ALEz0P7O2h`. Pro prices are EUR 7.99 monthly (`price_1TtzgyALEz0P7O2hBlv1fWHW`) and EUR 76.70 annually (`price_1TtzgzALEz0P7O2h82O61RF7`); Club prices are EUR 24 monthly (`price_1Ttzh0ALEz0P7O2hOsw6eCEr`) and EUR 230.40 annually (`price_1Ttzh1ALEz0P7O2harPzXoGH`). All are test-mode, active, tax-inclusive catalog objects.
- Stripe Live account `acct_1U3kLzLsMBe2Z56j` has complete business
  verification, an active payout profile, and one verified NOK bank destination.
  Live Pro product `prod_V3wiqVm9Rspv57` owns EUR 7.99 monthly price
  `price_1U3ootLsMBe2Z56j5ouTYD1c` and EUR 76.70 annual price
  `price_1U3ovtLsMBe2Z56j2zNv9wuz`, both active and tax-inclusive. Live webhook
  `we_1U3p0fLsMBe2Z56jfY18HBh9` targets the canonical billing route and receives
  only Checkout completion plus subscription create/update/delete. Live price
  IDs and the signing secret are installed in sensitive Production variables;
  the Live server key and `STRIPE_MODE=live` cutover remain pending provider 2FA,
  so Production is still intentionally Sandbox-backed.
- Voice: OpenAI transcription models are available; secrets stay in environment stores only.
- GitHub repository `ni1ra/dartio` is connected to Vercel with production branch `main`.
- Vercel has encrypted Production and Preview values for Neon database/Auth, Auth cookie secret, Pro and Club monthly/annual price IDs, `NEXT_PUBLIC_APP_URL`, Stripe integration/signing secrets, and `OPENAI_API_KEY`. This was verified by environment name and scope only; no secret value was printed.
- Manrope, Syne, and DM Mono are self-hosted from pinned Fontsource 5.3.0 packages. The prior `next/font/google` path made an otherwise deterministic build depend on Google's font CDN and failed both main CI and a local browser-gate build; no compile-time or browser font request now leaves the deployment.
- Migration `0006` is applied and ledger-reconciled on both branches as of 2026-07-30, 7 journal rows each. It adds `leg_number`, `darts_thrown`, and `aggregate_score` to `turns`, which is what makes a stored visit a lossless record of what was thrown. `turns` held 0 rows on both branches beforehand, verified per branch, which is why a `NOT NULL` column with no default was safe. Escape path: drop the three columns, which drops their checks with them. Production snapshot before the change: Neon branch `pre-0006-2026-07-30` (`br-dark-cloud-afis6s5i`).
- Pre-`0007` Preview recovery point: Neon branch
  `pre-0007-preview-2026-08-12` (`br-polished-wind-afvq590t`), created from
  exact retained Preview `br-fragrant-art-af79dyw5` without an endpoint or
  compute and re-read before migration. Migration `0007` adds only the partial
  B-tree `matches_completed_at_desc_idx` over
  `completed_at DESC NULLS LAST WHERE completed_at IS NOT NULL`. Its explicit
  escape is `DROP INDEX IF EXISTS matches_completed_at_desc_idx`; the campaign's
  destructive-operation hard stop means that statement is documented but is
  not executed on a retained branch. Preview applied it on 2026-08-12: the
  ledger moved 7→8 and the index 0→1 while 15 matches / 10 completed / 27
  players / 20 turns / 44 darts remained identical; PostgreSQL reported the
  index ready and valid. Production root snapshot
  `pre-0007-production-2026-08-12` (`snap-noisy-smoke-af9q2m6b`) was created
  from exact root `br-sweet-wildflower-afy2ygj6` after PR #33 merged and before
  Production migration; the snapshot operation finished and the source was
  re-read from the control plane. Production then applied `0007`: the ledger
  moved 7→8 and the index 0→1 while 15 matches / 15 completed / 30 players / 15
  turns / 15 darts remained identical; PostgreSQL reported the index ready and
  valid with the exact definition and predicate above.
- Preview migrations `0000` through `0005` are applied and ledger-reconciled as of 2026-07-17. External verification: 10 public tables, 6 migration journal rows, strict dart/email constraints, unique user Stripe-customer index, and nullable subscription/webhook lifecycle timestamps including `subscriptions.cancel_at timestamptz`.
- Production migrations `0000` through `0005` are applied and ledger-reconciled on main as of 2026-07-17. External verification matches Preview: 10 public tables, 6 migration journal rows, strict dart/email constraints, winner foreign key, Stripe uniqueness indexes, and nullable lifecycle timestamps including `subscriptions.cancel_at timestamptz`.
- The superseded Sandbox endpoint `we_1Tu0YUALEz0P7O2hYBwPCQwF` is disabled. The
  canonical endpoint `we_1U3dgDALEz0P7O2hpeRj6EFE` targets
  `https://dartioopus46.vercel.app/api/billing/webhook`, listens only to Checkout
  completion and subscription create/update/delete, and delivered both the
  one-use promotion subscription and its Portal cancellation with HTTP 200.
  Production access reflected both transitions; the complete Sandbox lifecycle
  is proven as of Cycle 30.
- Stripe Workbench request `req_RxZryIFiSs5OAC` proves the signed-in Pro annual Checkout request selected the configured price, persistent owned customer, 14-day trial, automatic tax, billing-address collection, promotion codes, ownership metadata, and an idempotency key. The initial request failed only because the sandbox lacked a head-office address. A synthetic Norwegian sandbox address subsequently saved and persisted across reload; no live legal or tax-registration data was created.
- Pro annual sandbox Checkout completed on 2026-07-17 for customer `cus_Utp4oZKj6432Jx`, creating trial subscription `sub_1Tu1j7ALEz0P7O2hD5xvbDeR` at EUR 76.70/year after 14 free days and EUR 0 due on creation.
- The original sandbox webhook destination returned HTTP 500 to the successful Checkout's invoice events because it targets the old production alias, while Preview owns the Checkout identity/database. Dedicated Preview destination `we_1Tu1pFALEz0P7O2hQVsTftWI` is active at the stable Cycle 2 alias and listens only to `checkout.session.completed` plus the eight current `customer.subscription.*` events. Vercel has a sensitive branch-scoped signing-secret override for `cycle-2-identity-billing-voice`; the global Preview/Production secret was not changed.
- Preview destination `we_1Tu1pFALEz0P7O2hQVsTftWI` processed two real Portal-cancellation `customer.subscription.updated` events with HTTP 200, zero failures, and 848–1305 ms response time on deployment `dpl_GvToqtNyNJCjzcGrYLDFVfZePqEV`. Neon stored both processed event IDs and exactly one owned Pro/trialing subscription row.
- Deployment `dpl_G2u7bDCCuSCJMeaciPTkXjdwj6mG` proved explicit cancellation recovery and reprojection: reactivation cleared `cancel_at`; rescheduling stored `cancel_at=2026-07-31T02:42:12Z` while keeping `cancel_at_period_end=false`, status `trialing`, plan `pro`, and one subscription row.
- GitHub release source: commit `70723231d4a6cbfc74291217e69e5809c6558637`;
  CI run [31670699278](https://github.com/ni1ra/dartio/actions/runs/31670699278)
  passed typecheck, lint, unit, build, and the full browser matrix.
- Current greenfield production deployment: `dpl_HfwydzpZTvtn2sQTAHfrVczV1jGf`
  at `https://dartioopus46.vercel.app`, READY on the exact release SHA with no
  alias error. This release adds mode-scoped Stripe-customer recovery and makes
  the active Stripe data plane authoritative over duplicate-subscription checks;
  its environment remains intentionally Sandbox-backed until the Live key's
  provider 2FA completes. The preceding `e52c1f` Production candidate passed
  auth, strict owner-only history/detail, rooms, room integrity, paid AI, paid
  voice, the complete 455-run/4-skip browser matrix, and bounded runtime-log
  inspection on 2026-08-13. Cycle 37 repeats those gates after the Live cutover
  instead of transferring that evidence to the new environment snapshot.
- Current Cycle 2 Auth/webhook preview deployment: `dpl_FfHXJZ9ZJJk7mWoDGiqieGx6LWCq` at `https://dartio-boreq0qif-niras-projects-868b6f5f.vercel.app`. It was redeployed on 2026-08-11 after Preview database-password rotation made its immutable predecessor stale; the stable branch alias retained its branch-scoped Stripe signing secret, picked up the current Preview `DATABASE_URL`, and then returned HTTP 200 for two signed sandbox subscription deliveries. Entitled X01 continuity/access-authority head `e3a80a4` passed GitHub verification run `29554449332`. Prior code Preview `dpl_AwDwqrqPYR8ufLdJUV5m91dQJLff` remains the rollback target for the Cycle 2 code.
- Preview has a branch-scoped `NEXT_PUBLIC_APP_URL` override for `cycle-2-identity-billing-voice`, targeting its stable Vercel alias. The global Preview and Production values were not changed.
- Paid features are authorized server-side only. `voice_always_on` gates `POST /api/voice/transcribe` before body parsing; `advanced_ai` gates one physical sample from `POST /api/ai/throw` for each level-9–20 dart while 1–8 stay local; `advanced_checkout` gates `POST /api/checkout/advice` for alternates, setup plans, and preference ranking while Free computes one route locally. All three read the server's own access snapshot and accept no client plan, access, or seed claim. The AI throw request is exactly `{ level, target }`: tactics and every mode rule remain in the client.
- Club Checkout is closed: `PLAN_CATALOG.club.checkout` is `unavailable`, `POST /api/billing/checkout` returns 409 for any non-`self_serve` plan before Stripe is called, and the pricing surface disables the action. Existing Club subscribers keep their projected entitlements.
- The canonical record of a match is its event log, not its state: `src/domain/x01-log.ts` folds the pure reducers over what was thrown. Events carry the dart, not the thrower — turn order derives the player — so a visit is corrected by rewinding to it, never by excising it from the middle. The log is versioned and zod-validated on read (`src/domain/x01-persistence.ts`); an unknown version is discarded rather than migrated.
- Active matches resume from local storage with no account, because free play requires no account. Completed matches are written to Neon as of 2026-07-30: `POST /api/matches` records `matches`, `players`, `turns`, and `darts` in one `db.batch`, which the Neon HTTP driver runs as a single transaction. Cycle 28 exercised those exact statements plus a guaranteed final constraint failure against an isolated Neon child: the transaction failed and a read-only residue check found zero marker users, matches, players, turns, or darts, with no cleanup delete. A real match also round-trips on Production. Room matches use the separate lifecycle writer described below.
- X01, Cricket, round modes, and drills now all resume through strict versioned
  envelopes. Round and drill readers bind the stored setup, roster, opponent,
  rules, and requested AI level, preserve unknown future formats byte-for-byte,
  migrate only identities they can prove, and contain every `localStorage`
  failure. A hydrated nonempty-to-empty transition clears a resume slot; an
  initial empty render cannot.
- Active local matches, drills, and live room players request the best-effort
  Screen Wake Lock capability and release it on hidden, completion, ineligibility,
  navigation, or unmount. Late grants are released rather than adopted. Refusal
  and unsupported browsers never block scoring or produce a support claim.
- Dartio publishes a standalone manifest at `/manifest.webmanifest` with `/play`
  as its start URL and mask-safe 192/512 PNG assets. It deliberately has no
  service worker, Cache Storage writer, background sync, or offline route:
  already-loaded local scoring may persist to `localStorage`, while cold load,
  navigation, auth, AI, voice, rooms, and history still require the network.
- Completed-match replay is mode-independent. `GET /api/matches/:id` reconstructs
  one completed `MatchRecord` only when the signed-in user occupies one of its
  player seats; missing and not-owned records share a private 404. Exact visits
  replay their stored darts and coordinates, while aggregate visits expose one
  marker-free unknown landing per declared dart and apply the recorded final
  score only at the visit boundary. The timeline never imports a mode reducer or
  distributes a typed total across invented beds.
- Rooms are live as of 2026-07-30 and `rooms`/`room_members` finally have a writer. The server is authoritative over three things and no more: membership (only a member writes, and only into their own seat), ordering (the turn number is assigned server-side, never sent), and mutual exclusion. The visit claim, turn insert, and dart inserts are one data-modifying Postgres CTE: `state_version = expected` either claims one complete visit or changes nothing, so two devices cannot file the same turn and an insert failure cannot strand a version without its turn. It is not a referee — checking a visit's legality needs the mode's rules, and X01's rotating leg starter means even "whose turn is it" is unanswerable without them. `/friends` claims exactly this much.
- A room match is played by rebuilding the log from the server's own visits: `x01LogFromTurns` is the exact inverse of `x01MatchRecord`, and `room-log.test.ts` asserts the round trip rather than assuming it. Join, reload, and catching up on an opponent's throw are therefore one code path. Visits are filed when finished, never dart by dart — a whole visit is the unit two clients can collide on.
- Room clients preserve that visit boundary under response loss as of Cycle 35.
  Ordinary reads do not overlap; explicit recovery supersedes them by generation;
  four failures pause polling and scoring; and versions cannot move backwards or
  revive pre-handover/pre-close controls. A finished local visit stays held until
  one authoritative read proves it accepted, unchanged/retryable, superseded, or
  terminal. Retrying is always explicit and only against the original version.
- **`matches.state_version` is also the turn number.** Every accepted visit increments it and takes its value in the same statement that inserts that visit, so nothing that does not append a visit may increment it. Close, completion, join, spectator admission, and handover serialize through the room/match rows and recheck an open status; terminal state is monotonic. Completion is idempotent because both clients replay the same log, see the same finish, and both report it.
- A room match must never run the local match's completion path. That files a whole `MatchRecord` as a new `matches` row, and the room already is that row; running both would put one game into history twice and into the statistics computed from it.
- A room lives 12 hours, its code avoids O/0 and I/1, and an expired room answers identically to a code that never existed. Opening, joining, and watching a room all require the `online_multiplayer` entitlement; Free carries zero online seats and a gallery chair is an online seat. `PRODUCT_AVAILABILITY.onlineMultiplayer` reads `implemented` as of Cycle 24 — create, join, play, reconnect, spectate, handover, and close are all live, and `/friends` carries zero "Planned" chips, asserted by the browser suite.
- **Ownership is mechanical as of Cycle 24**: the host alone hands the room over. One locked data-modifying statement rechecks `rooms.owner_user_id`, moves that canonical owner, and swaps the memberships, so competing gifts from a stale host leave exactly one owner. The host alone closes the room, writing `matches.status = 'abandoned'` with no winner or `completed_at`; close and completion contend on the same terminal row, and stale join/watch/visit requests cannot reopen it. Host departure is deliberately not an event: a room outlives presence, the twelve-hour TTL bounds it, and a leaving host hands over first. Expired rooms are unreachable but are not physically purged: the campaign forbids destructive database operations, so the first candidate's lazy `DELETE` was removed and archive/purge is parked pending a recoverable, separately authorized design. History and statistics require non-null `completed_at`, keeping active and room-abandoned rows out without hiding locally filed abandoned matches.
- **Cycle 24 hard-stop incident:** the first candidate's lazy `DELETE` did execute on Preview before removal. A count-only, read-only audit found zero owner/version/terminal anomalies among surviving Preview rooms, plus 2 pending/active and 3 multi-user matches with null `room_id`; at least three old Preview room rows were therefore purged and their memberships cascaded. No ids or account data were printed, no repair was attempted, and current code performs no physical expiry cleanup. The same Production audit found all five live anomaly counts at 0 and orphan signatures open=0, multi-user=0. Available evidence therefore confines confirmed impact to Preview.
- **A spectator is a membership row with no `players` row** (Cycle 23). The read-only promise is structural: turns and completion authorize by seat, so a watcher fails before any version arithmetic — refused as `spectator_read_only`, never as a stranger — and can never appear in match history or statistics, because those join from `players`. Spectators are counted (`watching`), not named; the gallery caps at 16; a spectator taking a seat is promoted in place, guarded so promotion can never rewrite an owner.
- **Read schemas in `rooms-client.ts` are deliberately not `.strict()`** as of Cycle 23: the server may grow additive fields, and a deployed bundle refusing a whole room over an unknown key it could ignore is a self-inflicted outage. Unknown keys are stripped; what is validated is what is used. Write payloads stay strict on the server, where strictness is the boundary's job.
- Career statistics are computed from completed stored visits, not from a live match, by `src/domain/match-stats.ts`. The public headline separates all sessions, decided competitive matches, and known drill sessions; winnerless non-drills stay neutral and drills cannot become losses even if a generic stored record carries a winner. The X01 definitions still agree with `x01PlayerStats`, while exact darts are ordered and checked before any finishing bed is attributed. The query joins from `players`, keeping a local opponent's visits out of a signed-in player's numbers.
- The statistics split is the catalogue's: Free carries `historyMatches: 50` and no `deep_stats`, so `GET /api/stats` returns only the headline and `deep: null`. Pro adds first nine, checkout outcomes, observed successful finishing doubles, explicitly unattributed finishes, chronological form/trends, all-mode results, and per-drill progress. A bed share is a share of attributable successful double finishes, never aim or attempt accuracy; exact straight/master non-double finishes and incomplete/aggregate evidence remain unattributed. The product client rejects contradictory sums, percentages, windows, units, and physical ranges before rendering.
- Every mode reduces to one `MatchRecord` (`src/domain/match-record.ts`) before it is stored, and each mode owns the adapter that produces it. The server never learns any mode's rules, so a seventh mode needs no server change. It validates shape and ownership only: every dart is checked against the same board the `darts` constraints enforce, and the account a match is filed under comes from the session, never from the request body.
- **`.env.local`'s `DATABASE_URL` addresses the `vercel-preview` branch, not `main`.** Its host is `ep-shy-brook-afwoyw0n`; production is `ep-raspy-lake-afeigwvp`. A row count or a schema check run with the repo's own env file describes preview and says nothing about production. Per-branch connection URIs come from the Neon control plane at `/projects/{project_id}/connection_uri?branch_id=…`.
- Playable modes as of 2026-07-31: X01, Cricket (standard / cut-throat / tactics), Around the Clock, Shanghai, Count-Up, Bob's 27, and the three drills — Checkout Lab, Doubles Matrix, and Scoring Sprint. All nine catalogue rows are playable; nothing on `/practice` is labelled coming next any more, and the branch that rendered an inert card was removed with the last row that needed it.
- Dartio reports on itself through `src/lib/server/observability.ts`: one bounded
  JSON object per event on stdout/stderr, which Vercel captures, with no
  third-party agent, key, cookie, or request made on a player's behalf. **The
  field list is an allow-list, not a spread** and contains no user id, email,
  token, cookie, room code, transcript, match payload, raw provider response,
  error name, or error message. Failures retain only a fixed category plus
  explicitly bounded route/status/mode/count context; tests reach past the types
  and use sentinel exceptions to prove those private values cannot serialize.
- `/api/auth/[...path]` now degrades honestly: an unreachable Neon Auth, or a 500 from it, answers **503 `auth_service_unavailable`** rather than 500, because a 500 says Dartio is broken and a 503 says an authority is temporarily unavailable — and only the second is true during a Neon outage. Refusals the auth service means, such as a wrong password or an untrusted origin, pass through unchanged.
- The match fits the screen it reserves as of 2026-07-31, measured rather than assumed: it ran to 1229 px in a 1000 px viewport with the command dock at y=1036, and now measures 1000 px with the dock ending at the bottom edge. Three causes: `#main-content` and `.match-page` reserved only the nav's 76 px while the stage starts 38 px lower (both now subtract `--stage-inset`, in `dvh`); `.match-page` had a `min-height` and no height, so `flex: 1` on the grid had nothing to distribute; and Navi's shell reserves room for a bottom navigation that only exists below 1100 px. **The board was never the constraint** — the middle column was, and it now scrolls inside the grid. `tests/browser/layout.spec.ts` asserts both measurements, with a 1 px tolerance for sub-pixel rounding.
- **The admin role is decided and deliberately not built.** Neon Auth already runs Better Auth's admin plugin, so `users` needs no `role` column and a second copy inside Dartio would leave two answers to who is an administrator. "Signed in as admin but the card reads FREE" was correct: role and entitlement are separate on purpose, and letting a role grant paid entitlements would hand out paid access with no billing record.
- Voice is continuous as of Cycle 18. `src/lib/voice/segmenter.ts` decides when speech begins and ends from loudness alone, keeps a short pause from splitting one utterance, and discards anything under 180 ms — mostly darts hitting the board. Hands-free capture records only after speech begins, caps one utterance at nine seconds, stops and discards on visibility loss or blur, then re-arms while the player keeps the explicit toggle active.
- `POST /api/voice/transcribe` requests JSON token logprobs from `gpt-4o-mini-transcribe` and returns exactly `{ transcript, command, confidence }`. Dartio aggregates the model's own signal as `exp(mean(logprobs))`; malformed evidence is `0`, and the 0.6 floor is review policy rather than a calibrated correctness probability. Push-to-talk still requires explicit review. Hands-free may apply a clear command, holds doubtful commands FIFO, refuses low-confidence control words, and invalidates capture, held work, and late responses whenever the match revision or component lifecycle changes.
- Cricket and the four round modes have opponents as of 2026-07-31, each with its own aim policy in its own module — `cricket-ai.ts` and `round-ai.ts`, neither importing the other. Where a mode has one defensible target the policy says so: Count-Up is always the treble twenty and Bob's 27 is always the round's double, so a stronger opponent there is a steadier hand and nothing else. Around the Clock's real decision is that any bed advances you, so the big single beats the treble; Shanghai's is that an expert plays for the single-double-treble win.
- X01, Cricket, Around the Clock, Shanghai, Count-Up, and Bob's 27 all expose the same **levels 1–20** as of Cycle 25. Levels 1–8 sample locally; 9–20 ask the rules-blind server for one landing at a time only after canonical `advanced_ai`, `aiMaxLevel`, and implementation checks. X01, Cricket, and round target choosers run against temporary reducer state after each landing, so the server never learns a score, mode, rule, turn, or visit.
- Opponent resume is part of the access boundary, not only a UI preference. X01, Cricket, and round active-match envelopes are scoped by solo/local/requested AI level and persist both a permanent level-eight continuation and the distinct levels that actually completed visits. A first committed Free/unavailable fallback locks the match at 8 across reload; history records one bot level only when the persisted executions agree. Safe v1 solo/local logs migrate, while ambiguous v1 AI logs start fresh once because they never stored a level that could be recovered honestly.
- `collectAiVisit` and `use-ai-visit.ts` jointly protect opponent turns. The collector captures the starting turn/visit boundary, samples sequentially into temporary reducer state, and returns one complete dart array; a second-request failure commits nothing and a one-dart leg cannot spill into the next same-seat leg. The hook replays the current log when its delay actually fires and owns an `AbortController` plus generation token, so undo, correction, retry, navigation, and unmount cannot append a stale visit. This is the hardened form of the ref-based fix for the old runaway-X01 loop.
- A drill is an attempt ledger rather than a game: a fixed list of targets, up to three darts each, taken or not. `DRILLS` holds one rules entry per drill the way `ROUND_MODES` does, so a fourth drill is a table entry. An attempt ends the moment it is decided — a double landed on the first dart, or a checkout overshot — rather than at three darts.
- Every mode owns its rules and its log and imports nothing from another mode. What they share is the regulation board (`src/components/dartboard.tsx`), the per-dart pad, the keyboard scheme, visit rewind, and local resume. Adding a mode must not require editing an existing one.
- `pnpm test:browser` runs against production by setting `DARTIO_BASE_URL`. On 2026-07-28 it passed 115 with 2 skipped against `https://dartioopus46.vercel.app`. The suite grew from 102 in the same session: a green 102/102 had been reported against a deployment whose top bar offered a phone no way to sign in, because the suite asserted that `/auth/sign-in` answers 200 and never that a visitor could reach it. Nav reachability and accent-foreground contrast are now asserted rather than assumed.
- **Production authentication works as of 2026-07-28.** The production branch's Neon Auth trusted-domain list was empty — `{"domains":[]}` on `br-sweet-wildflower-afy2ygj6`, while preview carried its Cycle 2 alias. `https://dartioopus46.vercel.app` and `https://dartio.vercel.app` were added through the Neon control plane and `pnpm verify:auth` now passes; a real account signed up and signed back in against production, 200 both.
- The Neon control plane is reachable without the console. `neonctl` OAuth credentials with a refresh token live at `~/.config/neonctl/credentials.json`; org `org-wild-credit-66143021`, project `nameless-tooth-63658537`. Trusted domains are per branch at `/projects/{project_id}/branches/{branch_id}/auth/domains` (GET, POST, DELETE). A deployment on a new URL needs its origin added there or nobody can sign in to it, and no repository check will tell you — `pnpm verify:auth <url>` is the one that will.
- `neonctl branches create --output json` can include a complete generated `connection_uri` and role password. Never print that raw response: capture it inside one process, log only branch/endpoint identifiers, and pass the URI directly to the consuming command through memory. During Cycle 28 the first disposable-child creation exposed only that new child's generated credential in tool output; it was immediately reset (HTTP 200, operation finished) before use. Preview and Production credentials were not exposed.
- **Preview and production run separate Neon Auth projects.** `DARTIO_QA_EMAIL`/`DARTIO_QA_PASSWORD` are a production identity and are refused with `INVALID_EMAIL_OR_PASSWORD` against a preview deployment. Anything probing behind the login wall on preview has to sign up its own throwaway identity first.
- Trusted domains are per branch and the two verbs take different bodies. `POST /projects/{project_id}/branches/{branch_id}/auth/domains` takes `{domain, auth_provider}`. `DELETE` on the same path takes `{auth_provider, domains: [{domain}]}` — plural, an array of objects, with `auth_provider` at the top level. A wrong shape answers 400 naming one missing field at a time, so it takes several attempts to converge. Adding a PR deployment's origin, probing it, and removing it again is how an authenticated feature is proven on preview before it reaches production.
- Neon Auth already runs Better Auth's admin plugin: accounts carry `role`, `banned`, `banReason`, and `banExpires`, and the control plane exposes `PUT /projects/{project_id}/branches/{branch_id}/auth/users/{auth_user_id}/role`. An admin/superadmin capability likely does not need a `users.role` column of its own.
- There is no admin or superadmin role in Dartio, by decision rather than by omission — see the row above.
- Supabase is explicitly out of scope.
- Never store secret values in repository files or documentation.

## Canonical commands

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:browser:install` (once per machine)
- `pnpm test:browser` — the Cycle 36 release has 459 checks across 390×844,
  834×1112, and 1440×1000; 455 run and 4 skip by design, those being the sign-up
  assertion at the two widths where sign-up is deliberately absent and the
  screenspace assertion at the two widths whose reservation it does not describe.
  The exact merge repeated all 455 runnable checks against Production. Set
  `DARTIO_BASE_URL` to run against Preview or Production instead of a local build.
- `pnpm db:generate` — writes the migration; it does not apply it
- `DATABASE_URL=<branch-uri> pnpm exec drizzle-kit migrate` — applies pending migrations to one branch and reconciles the journal. Preview first, then main. The URI is passed only through a credential-safe in-memory wrapper, never as a positional argument or printed shell assignment. The repo has no `db:migrate` script because the URL is never the one in `.env.local` for production work

## Release ladder

0. `pnpm verify:auth <deployment-url>` — a deployment can serve 200s on every route while authentication is entirely dead, because Neon Auth enforces trusted origins on its own service. This is the only check that catches it.
0b. `pnpm verify:history <deployment-url>` — accepts only a named Dartio
Production host, this team's Dartio Preview hosts, or loopback; a fixed-message
preflight resolves the origin before the first request, ignores ambient target
variables, rejects redirects, and never reflects response bodies. It signs in,
files a one-dart D20 match, reads both its summary and strict owner-only detail
back, checks the statistics computed from it, and asserts anonymous
history/detail/stat requests are refused. The browser suite exercises free play
only, so this gate sees the authenticated persistence path.
0c. `pnpm verify:rooms <deployment-url>` — asserts every room endpoint refuses a request with no session, and that a plan without online play is refused with 402 before a room exists. A gate that quietly opens is the failure nobody notices.
0d. `pnpm verify:rooms:live <preview-url>` — reads the Preview-only `DATABASE_URL` directly from ignored `.env.local` and validates the branch's exact pooler host; ambient variables cannot override it. The documented package invocation therefore contains no credential. A positional database argument is refused after launch and must never be supplied because package managers echo arguments before script code runs. It runs the full room round trip with four throwaway identities, a version collision, competing handovers, canonical-owner inspection, close-versus-complete arbitration, and history/statistics exclusion. **Preview only, and it writes**: it removes its temporary Pro rows but leaves the probe identities and match records on Preview, and it refuses both the Production origin and any database outside the named Preview branch. It exists because fake databases do not render or execute the lifecycle SQL.
0e. `DATABASE_URL=<branch-uri> pnpm verify:rooms:integrity <label>` — read-only count audit for owner/canonical-role agreement, version/turn agreement, terminal-field consistency, and historical room-purge signatures. Run on Preview and Production; it prints counts only and never row ids or the URL.
0f. `pnpm verify:ai:live <deployment-url>` — application-data-safe paid-AI gate. It accepts only a validated Dartio Preview/Production origin, reads the existing QA identity from environment variables, refuses redirects, proves anonymous and strict-body refusals, and takes 25 level-20 samples for each of S20, D20, T20, outer bull, and inner bull. Every success is independently re-scored from its coordinates; each sample centroid must land within 0.04 normalized board radii of the requested bed, which proves both segment and multiplier without requiring an individual dart to hit. Every AI response must be `private, no-store`. A 403 is a failed gate, never treated as proof. It never signs up, reads the database, or writes a match, billing row, or product row; sign-in necessarily creates the ordinary auth session used by the check.
0g. `pnpm verify:voice:live <deployment-url>` — application-data-safe paid-voice gate. It shares the AI verifier's fixed-message Dartio-origin and environment-credential boundary, proves anonymous and malformed-audio refusals, then sends one checked-in synthetic “treble twenty” WAV through the entitled route. Success must be the exact T20 command with a finite non-zero confidence and `private, no-store`; 402/403 is a failed gate. It prints no audio, transcript, token, confidence value, cookie, or credential and writes no Dartio application row. Sign-in creates the ordinary short-lived auth session required by the check.
1. Local deterministic checks.
2. Local browser stories at mobile, tablet, and desktop.
3. GitHub pull request with CI.
4. Vercel preview with sandbox integrations.
5. Production deployment and post-deploy verification only after preview proof.

## Rollback

A written path, because "Vercel retains prior deployments" is a fact and not a
procedure. In order:

1. **Confirm it is the deployment.** `pnpm verify:auth <url>`, then
   `pnpm verify:history <url>`. If both pass, the deployment is serving and
   authenticated — the fault is narrower than the release and rolling back may not
   help.
2. **Promote the last good deployment.** `vercel rollback` from the project, or
   promote the prior Ready production deployment from the dashboard. Code rolls back
   in one step because every migration this phase shipped is additive.
3. **Leave the database alone unless the migration is the fault.** Migration `0006`
   only adds columns, so older code ignores them; there is no version of the app
   that breaks because they exist. The escape path, if one is ever needed, is
   dropping the three columns, and the pre-change snapshot is the Neon branch
   `pre-0006-2026-07-30` (`br-dark-cloud-afis6s5i`).
   Migration `0007` is likewise additive and older code ignores its index. Its
   Preview recovery point is `pre-0007-preview-2026-08-12`
   (`br-polished-wind-afvq590t`); Production snapshot
   `pre-0007-production-2026-08-12` (`snap-noisy-smoke-af9q2m6b`) preserves the
   root immediately before application. The schema escape is
   `DROP INDEX IF EXISTS matches_completed_at_desc_idx`, but executing that
   destructive step requires separate authorization.
4. **Re-verify after the rollback**, with the same two commands plus
   `DARTIO_BASE_URL=<url> pnpm test:browser`. A rollback that is not verified is a
   second deployment nobody checked.

What cannot be rolled back by promoting a deployment: Neon Auth trusted domains,
Stripe configuration, and anything applied through the Neon control plane. Those are
changed deliberately and one at a time, and each is recorded above.

- Vercel retains prior ready production deployments.
- Recoverable pre-greenfield production target: `dpl_2CiBPFdxJzJe6vYwu8vk4QEzLm4x`. It serves the legacy build and is rollback-only, never greenfield v1 proof.
- Database changes require forward-safe migrations and an explicit escape path.
- Production remains Sandbox-backed until the operator-authenticated Live key
  cutover completes. The sub-NOK-100 proof purchase is explicitly authorized;
  provider 2FA, signed Live entitlement, balance, and terminal payout are still
  evidence gates rather than assumed outcomes.

## Phase 2 closure — 2026-07-31

- Eleven cycles, eleven pull requests, each green before merge and each verified on production after it. **All sixteen gaps in `artifacts/GAP_AUDIT_2026-07-28.md` are closed**, along with the `get-session` defect the harness found rather than the audit. `docs/CYCLE_22_phase_closure.md` scores each one.
- 367 unit tests became **547** across 44 files; 120 browser checks became **159**; 19 routes became **25**.
- Phase 2 closed with an honest remainder: room spectators and ownership handoff, levels 9–20 outside X01, a real voice-confidence signal, live Stripe activation, and the Cycle 11 MCP tooling row outside this repository. Cycles 23–26 close the first four product-code gaps; live Stripe activation and the external MCP tooling row remain outside that work.

## Known release gates

- The regulation dartboard gate is executable as of 2026-07-28: `tests/browser/dartboard.spec.ts` asserts one square in-bounds SVG, 80 scoring beds, 20 numerals, and a physical treble-twenty click scoring 60 / leaving 441, at all three viewports. Board changes rerun it through `pnpm test:browser`.
- Navi UI is the component system, and third-party stylesheets that ship an unlayered reset must be scoped to their own route segment. `@neondatabase/auth/ui/css` loads from `src/app/auth/layout.tsx` for this reason; loading it globally strips border, background, and radius off every Navi component, because unlayered CSS outranks Navi's `@layer navi.*` at any specificity.
- The regulation dartboard and three-viewport production visual proof passed; future board changes must rerun the same physical T20 and boundary suite.
- Cycle 2 preview repeated the dartboard gate at exact 1440×1000, 834×1112, and 390×844 viewports: 3/3 independent contexts passed square/in-bounds geometry, 80 beds, 20 labels, zero horizontal overflow, and physical T20 → 60 / 441. Full-page tablet/mobile visual inspection also passed. Ultrawide review found and corrected a shell-centering cascade defect outside the board renderer; the corrected preview measured a centered 1472 px stage at `x=544` on a 2560 px viewport, retained a 600×600 board, and passed the full three-width matrix again with zero retries.
- Figma library implementation is externally blocked by the current one-mode/View-seat limitation.
- Phase 3 is closed. The active remainder is Phase 4: terminal Live Stripe
  payment/bank-payout proof and final credibility closure.
  Cross-mode voice, personalized checkout evidence, custom practice, additional
  modes, server-backed friend rooms, continuous X01 voice, replay, deep
  statistics, resilience, and the full Sandbox Checkout/Portal/webhook lifecycle
  are already implemented.
- Checkout success and Portal return URLs must target the implemented `/account` hub. The nonexistent `/account/billing` target was removed on 2026-07-17 and is covered by the billing policy test.
- Stripe Customer Portal opened for the authenticated QA identity and returned to `/account` without a route error. Before the branch-scoped origin override, that return resolved to the old main alias and lost the new authenticated account surface. Deployment `dpl_8q1KD49P1Se5YxKFrSxrpGFwFAZL` proved the corrected same-origin path returns to the stable Preview alias with verified identity and active session preserved.
