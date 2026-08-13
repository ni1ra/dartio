# Cycle 35 — Rooms Under Bad Networks

Status: active on `codex/cycle-35-room-resilience`.

Cycle 24 made the server authoritative at visit granularity: the expected
version, turn row, and exact darts commit atomically, while handover, close, and
finish are ordered terminal choices. This cycle makes the browser honor that
contract when responses are delayed, reordered, or lost. It does not turn a
room into a dart-by-dart offline game or hide uncertainty behind blind retries.

## Contract

- A room surface has at most one ordinary poll in flight. An explicit recovery
  supersedes and aborts the old read; only the latest request generation may
  update authority. A response can never move the displayed visit version
  backwards or restore pre-handover/pre-close controls.
- Four consecutive read failures pause new room input and show a recoverable
  connection state. The last authoritative scoreboard remains visible, the
  player's seat remains server-owned, and one explicit check can resume play.
- A completed local visit is held intact until its POST outcome is known. After
  a transport failure the browser reads the room before doing anything else:
  an exact matching turn confirms success; an unchanged live version permits
  one explicit retry; another accepted turn supersedes it; and terminal state
  refuses it. No branch blindly duplicates a visit.
- The same expected-version write is safe after a response loss: if the first
  request committed, the reread identifies that exact turn; if it did not, the
  retry may claim the original version; if somebody else won, the server's
  version conflict stands.
- Handover and close stay disabled from click until an authoritative reread.
  An outcome-unknown host action is reconciled against the room before the UI
  offers it again. A delayed old poll cannot restore host authority.
- Match completion remains idempotent and gains an explicit confirmation
  recovery. If close wins the race, canonical `abandoned` state takes display
  precedence and every scoring/finish control disappears.
- Half-thrown darts remain local to the open device, exactly as before. The UI
  never claims that an unfinished in-hand visit reached the server.

## Queue

- [x] Add pure visit-outcome reconciliation and exact-turn comparison tests.
- [x] Serialize/generation-guard lobby and match reads, with bounded failure and
  explicit reconnect states.
- [x] Hold a finished visit through transport uncertainty and add safe
  confirm/retry/superseded/terminal recovery.
- [x] Keep host actions locked through authoritative refresh and reconcile
  outcome-unknown handover/close results.
- [x] Add controlled latency, response-loss, duplicate-delivery, delayed
  handover, reconnect, and close-vs-finish browser stories at 390, 834, and 1440.
- [x] Pass local unit/type/lint/build/browser and visual QA, then rebase onto the
  Cycle 34 merge without changing the verified product tree.
- [ ] Pass exact-head Preview and CI, merge, repeat the canonical Production
  room/integrity/browser ladder, and archive the cycle.

## Safety and scope

The browser still cannot decide room order, claim a seat, complete a match, or
name a host. Recovery compares server facts and resubmits only against the same
expected version. No database migration, destructive cleanup, background sync,
service worker, unbounded automatic retry loop, or private match payload logging
is introduced.

## Receipts

Planning baseline, 2026-08-13:

- The branch is stacked from Cycle 34 commit
  `3bcb5d25c8d6118b071ea1253b7a967bea44a531` while PR #39 runs exact-head CI and
  Preview. It will be rebased onto Cycle 34's merge before its own PR.
- Server review confirmed that append already claims the expected match version,
  inserts the turn, and inserts its darts in one SQL statement; a zero-row claim
  is reread into terminal state or `version_conflict`.
- Client review reproduced four gaps in source: overlapping interval reads have
  no generation guard; four failed match polls leave input enabled; a lost visit
  response drops the settling dart while saying nothing scored; and a finish
  report marks itself sent before observing the result.

Final local candidate, 2026-08-13:

- The room read boundary now retains the exact turn identity used for recovery
  and fails closed on malformed turns. Pure reconciliation plus client/server
  room tests passed 4 files and 111 tests; TypeScript and scoped ESLint passed.
- The shared board and lobby each allow at most one ordinary poll. A monotonic
  generation makes explicit recovery supersede an old request, older versions
  cannot replace the display, four failures pause both polling and scoring, and
  one user-triggered reconnect resumes them.
- A settled visit remains intact through an outcome-unknown POST. The browser
  reads first, confirms an exact accepted turn, offers an explicit retry only at
  the unchanged version, or yields to a superseding/terminal server state. Host
  actions and finish reports use the same observe-before-retry discipline.
- The production-build focused matrix passed 33/33 across 390x844, 834x1112,
  and 1440x1000 after one test-only correction: Playwright does not classify a
  disabled `fieldset` itself as a disabled control, so the assertion was pinned
  to its real `disabled` attribute. No product workaround was added.
- Full local Vitest passed 69 files and 1,031 tests with only the established
  opt-in live rollback proof skipped; full ESLint passed.
- The first full browser run exposed one stale room fixture in the cross-mode
  voice story: it lacked the authoritative turn `version` added to the room read
  boundary. That fixture was corrected, and the exact story then passed 3/3.
  A later adversarial pass added same-version close precedence plus stale-host
  refusal recovery; 33 prior focused stories remained green and each new story
  passed at all three widths. The final full matrix passed 395 runnable checks
  with the four established layout skips.
