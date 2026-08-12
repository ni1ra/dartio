# Cycle 28 — Statistics with Depth

Status: active on `codex/cycle-28-statistics-depth`.

Sixth cycle of `PHASE_3_promise_completion.md`. Dartio already computes a
small authenticated career summary and already withholds its existing deep
statistics from Free accounts at the server boundary. This cycle deepens that
same projection without inventing aim data, makes practice sessions honest,
indexes the completed-match read path, and proves the atomic persistence claim
against a real Neon transaction failure.

## Truth boundary

Stored darts describe where a dart landed. They do not record the bed a player
intended to hit. A per-double view can therefore report only successful,
exactly stored finishing doubles:

- `finishingBeds` contains only double beds that actually completed an X01
  match and have at least one observed hit;
- each share is the bed's share of attributable successful double finishes,
  not an attempt rate or accuracy percentage;
- an aggregate checkout can prove that a checkout happened but cannot prove
  its finishing bed, so it increments `unattributedCheckouts` and never creates
  an invented double;
- a valid straight- or master-out finish on an exact single or treble likewise
  has no finishing double to place in this table; it remains in
  `unattributedCheckouts` even though its non-double landing itself is known;
- exact darts remain ordered by their stored ordinal before the finish is
  attributed.

Drills are attempt ledgers, not competitive losses. The headline keeps total
sessions visible, but the competitive win percentage uses only won and lost
matches. Drill rows are `unscored`, appear in practice progress, and never
depress competitive form. A winnerless non-drill filed through the public
record boundary also remains `unscored`, but it is not relabelled as practice;
it stays visible only in the total and its per-mode no-result count.

Recent form, X01 trend points, mode splits, and drill samples are all derived
only from the signed-in player's completed rows. Recent windows are selected
newest-first and returned chronologically for presentation. Empty or
aggregate-only evidence produces an honest empty/unknown state rather than a
synthetic value.

## Product and access contract

- The existing public headline gains explicit competitive-match and practice-
  session counts while preserving total sessions.
- Deep statistics add finishing-bed distribution, unattributed checkouts,
  recent competitive form, recent X01 averages/checkout rates, per-mode
  splits, and per-drill latest/best/average/recent progress.
- Mode rows distinguish won, lost, and unscored sessions. A win percentage is
  absent when a mode has no competitive result.
- Drill units come from the drill's own recorded score contract; unlike units
  are never combined into one number.
- `GET /api/stats` continues to return `deep: null` for Free. No client query,
  plan claim, or hidden UI state can request the paid projection.
- The strict product client rejects malformed, non-finite, out-of-range, or
  internally inconsistent statistics before rendering them.
- The account surface explains the evidence boundary in plain language and
  remains readable without horizontal overflow at 390×844, 834×1112, and
  1440×1000.

## Data and rollback contract

Read-only live inventory on 2026-08-12 found PostgreSQL 17.10 on both Neon
branches and no index beginning with `matches_completed_at`; only the primary,
room, and status indexes existed. Preview held 15 matches / 10 completed;
Production held 15 / 15. No row IDs or connection values were printed.

Migration `0007` is limited to one partial descending B-tree index over
`matches.completed_at` for rows where `completed_at IS NOT NULL`. That matches
the completion predicate and newest-first ordering used by history and
statistics without indexing open or abandoned room rows. The additive index
changes no row, status, entitlement, or API shape.

Before applying it to a branch with retained data, create and record a named
recovery point, re-read the branch's index/count state, then migrate Preview
before Production. Current Neon snapshots can be created only from a root
branch. Production `main` is the root and gets a named snapshot; the retained
`vercel-preview` branch is itself a child of `main`, so its equivalent recovery
point is a named, unchanged child branch created from Preview immediately before
the migration. The explicit schema escape path is:

```sql
DROP INDEX IF EXISTS matches_completed_at_desc_idx;
```

The campaign's destructive-operation hard stop means that escape is documented
but not executed against either retained branch. A rollback would instead
restore/promote from the named snapshot or require a separately authorized
transactional drop.

Preview recovery point: `pre-0007-preview-2026-08-12`
(`br-polished-wind-afvq590t`) is an unchanged child of retained Preview
`br-fragrant-art-af79dyw5`. It was created without an endpoint or compute and
re-read from the control plane before migration `0007` was allowed to run.

`POST /api/matches` already sends match, players, turns, and darts through one
Neon HTTP `db.batch`. This cycle does not call a fake queue proof sufficient:
an opt-in test on an isolated Neon child branch appends a guaranteed constraint
failure to the real batch and proves that a unique marker leaves zero rows in
all four tables. The failure proof performs no cleanup delete; zero residue is
the assertion.

## Queue

- [x] Extend the completed-match reader with completion time and exact ordered
  darts while preserving owner-only, completed-only filtering.
- [x] Add deterministic headline, finishing-bed, unattributed checkout,
  recent-form, X01-trend, per-mode, and drill projections with full truth-
  boundary tests.
- [x] Keep deep fields withheld at the server for Free and add a strict product
  client for the complete response.
- [x] Build the responsive, accessible account statistics surface and its
  three-viewport browser stories, including paid, Free, empty, and malformed
  states.
- [ ] Generate migration `0007`, record its forward/escape contract, and prove
  the partial index shape against actual Preview schema after its named branch
  checkpoint; take the named root snapshot before Production.
- [x] Exercise real Neon HTTP batch rollback on an isolated child branch under
  injected constraint failure, proving zero match/player/turn/dart residue.
- [x] Pass full local typecheck, lint, unit, build, focused browser, and full
  browser gates on one frozen candidate; complete independent adversarial
  audit.
- [ ] Push one PR, pass exact-head CI and Preview proof, merge the exact green
  revision, then repeat migration safety, standing verifiers, touched browser,
  full browser, exact deployment, and main CI proof on Production.

## Release safety

The statistics projection is read-only. The only retained schema change is the
additive index. The isolated rollback probe intentionally fails its transaction
and must leave no application row behind. It never runs against Production and
never deletes its way back to green. No Stripe object, OpenAI request, room
lifecycle, or entitlement row is changed in this cycle.

## Receipts

Planning inventory, 2026-08-12:

- Branch `codex/cycle-28-statistics-depth` was created from exact Production
  merge `d64997d5d8c913e94281fb0bea1585dcde9a7a52` with a clean worktree.
- Both live Neon branches reported PostgreSQL 17.10 and no completed-time
  index. Aggregate-only table counts were recorded above; no row identifier or
  secret was printed. The control plane also confirmed that Preview is a child
  of Production `main`, while `main` is the primary root branch.
- Current official Neon documentation was checked for branch snapshots,
  root-only snapshot creation, recovery, B-tree ordering, and partial-index
  trade-offs before this migration contract was written.
- Isolated rollback branch `cycle28-rollback-proof-2026-08-12`
  (`br-wild-meadow-afb2yrn0`, endpoint prefix `ep-damp-rice-afmrsj1i`) was
  created directly from Preview. Raw `neonctl --output json` unexpectedly
  included its generated role credential in tool output. That child-only
  credential was immediately discarded and reset through the Neon API (HTTP
  200); the resulting branch `apply_config` operation reached `finished`.
  Neither retained Preview nor Production credentials were exposed. All later
  connection material is captured and consumed in memory with filtered output.
- With the rotated URI held only in process memory, the opt-in Vitest proof ran
  the real `recordMatch` Neon HTTP statements plus a final guaranteed check-
  constraint failure against that exact child endpoint: 1/1 passed, exit 0 in
  2.73 seconds. Its post-failure query found zero marker rows in users, matches,
  players, turns, and darts. No cleanup statement followed. The first wrapper
  attempt stopped before Vitest because its PATH omitted Node; adding the pinned
  Node directory was the only correction before the successful run.
- The final candidate repeated that live proof after its endpoint guards were
  frozen: all five tests passed in 2.20 seconds, including the one real Neon
  batch failure in 1.82 seconds, with zero residue and no cleanup statement.
- Preview recovery checkpoint `pre-0007-preview-2026-08-12`
  (`br-polished-wind-afvq590t`) was created from exact retained Preview
  `br-fragrant-art-af79dyw5` at `2026-08-12T01:14:18Z`. A filtered control-plane
  re-read proved the expected parent, one uniquely named branch, no endpoint,
  and a finished operation; no connection material was printed.
- The retained Preview branch was then re-read and migrated through the pinned
  `pnpm exec drizzle-kit migrate` path. Before/after application data was
  identical: 15 matches, 10 completed, 27 players, 20 turns, and 44 darts.
  The Drizzle ledger moved from 7 to 8 rows and the named index from 0 to 1.
  PostgreSQL reported the index both ready and valid with exact definition
  `completed_at DESC NULLS LAST` and predicate `completed_at IS NOT NULL`.
- Final local deterministic gates on the frozen source: typecheck and full lint
  exited 0; all 58 Vitest files passed with 915 tests passed and the one
  separately proven live-write case skipped; `db:generate` reported no schema
  changes; and the production build generated 22 pages successfully.
- The final account-statistics stories passed 12/12 across 390×844, 834×1112,
  and 1440×1000. The complete browser matrix collected 288 checks and finished
  with 284 passes plus the four designed layout skips, exit 0 in 264.8 seconds.
  Independent adversarial review finished with no remaining source, data,
  privacy, access, migration, rollback, or accessibility blocker.

PR #33 Preview candidate `d9f2bc7462494748fbeca3c51b1329cd710926bc`,
2026-08-12:

- GitHub Actions run
  [31553174206](https://github.com/ni1ra/dartio/actions/runs/31553174206)
  passed typecheck, lint, unit, build, and browser proof in 7m11s on the exact
  head SHA.
- Vercel deployment `dpl_Atzu7izDdGbaYpnqWRJEHbRpHYw5` was READY with target
  `preview`, PR 33, no alias error, and the exact head SHA. Its immutable URL
  was `https://dartio-gamzeqj7r-niras-projects-868b6f5f.vercel.app`.
- `pnpm verify:auth` accepted that origin. `verify:history` authenticated,
  filed one synthetic D20 checkout, read its exact owner detail and summary,
  derived the Free headline while withholding `deep`, and proved anonymous
  history/detail/statistics refusal. The room sweep proved every anonymous
  endpoint returns 401; its paid boundary was explicitly skipped because the
  standing Production QA identity was not sent to Preview.
- The touched statistics surface passed 12/12 in 7.7 seconds. The complete
  deployed matrix passed 284 with the four designed viewport skips in 2.6
  minutes.
- The immutable Preview origin was added to Preview Neon Auth only for these
  probes (exact count 1), then removed afterwards (exact count 0). The
  pre-existing stable Cycle 2 origin remained present at count 1.

PR, exact-SHA Preview application proof, CI, merge, the Production root
snapshot/index application, and Production post-deploy receipts remain open
until their exact commands finish.
