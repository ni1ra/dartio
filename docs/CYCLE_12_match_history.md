# Cycle 12 — Persisted Match History

Status: closed on production evidence, 2026-07-30. PR #15.

Six tables shipped in migration `0005` on 2026-07-17 and never took a row.
`matches`, `players`, `turns`, `darts`, `rooms`, and `room_members` were audit gap
5, and they are why there is no history, no statistics, no cross-device continuity,
and an account hub that can only show a membership card. This cycle writes to four
of them; rooms belong to cycles 14 and 15.

## What was built

**One record every mode reduces to** (`src/domain/match-record.ts`). Modes agree on
almost nothing — X01 counts down, Cricket closes numbers, Bob's 27 goes negative —
so a history table that understood each of them would need editing every time a
mode is added. `MatchRecord` is the one thing they do agree on: somebody sat in a
seat, threw a visit, and the number in front of them changed. Each mode owns the
adapter that produces it (`x01MatchRecord`, `cricketMatchRecord`,
`roundMatchRecord`), so the six playable modes all persist and none of them imports
another.

**A writer** (`src/lib/server/match-history.ts`). Every id is generated before the
write, because the rows reference each other — knowing them up front turns four
dependent round trips into one `db.batch`, which Neon's HTTP driver runs inside a
single transaction. A match therefore never lands with half its darts missing. The
winner is set by a final update rather than in the insert: `matches` points at a row
in `players` and `players` points back at the match, so one of the two has to arrive
incomplete.

**A boundary** (`src/app/api/matches/route.ts`). The record is built on the device,
because only the device knows which mode was played. What the server does not take
on trust is its shape or its owner: every dart is validated against the same board
the `darts` check constraints enforce, and the account it is filed under comes from
the session. A request cannot file a match into somebody else's history, claim the
AI's seat, or claim a seat nobody played.

This is history, not officiating. Room play is server-authoritative and lands in
cycle 14; nothing here decides a result anybody else is bound by.

## The migration

`0006_special_wraith.sql` adds three columns to `turns`, one concern: making a row
a lossless record of a visit.

- `leg_number` — the visit's grouping unit. X01's leg; 1 throughout in the modes
  that have no legs, whose round is recoverable from turn order and seat count and
  is therefore not stored twice.
- `darts_thrown` and `aggregate_score` — a visit typed as a total leaves no darts
  behind, and if it busted, the score it claimed is otherwise gone entirely.

**Escape path:** the change is additive, so the down is `alter table turns drop
column leg_number, drop column darts_thrown, drop column aggregate_score` — dropping
a column drops its check constraints with it. A Neon branch of production,
`pre-0006-2026-07-30` (`br-dark-cloud-afis6s5i`), was taken before it ran.

## Verified receipts — 2026-07-30

- **`.env.local` points at preview, not production.** The first row-count reading of
  the six tables was taken against `br-fragrant-art-af79dyw5`, believing it was
  main. Both branches were then checked separately: `turns` held 0 rows on each, and
  each had 6 journal rows, which is what made a `NOT NULL` column with no default
  safe to add. This is the same shape of mistake as the trusted-domains one — an
  assumption about which environment a credential addresses, allowed to stand as a
  fact.
- Migration applied to preview first, then to main. Both branches now report
  `leg_number integer NOT NULL DEFAULT 1`, `darts_thrown integer NOT NULL`, and
  `aggregate_score integer NULL` on `turns`, with 7 journal rows.
- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`, **418
  tests across 33 files**, up from 367 across 29 at the start of the cycle.
- The baseline browser suite was measured unpiped before any of this work:
  **118 passed, 2 skipped** at all three viewports. `REPO_CONTROL.md` had recorded
  117 checks; the suite is now 120, and that row is corrected here.

## Production receipts — 2026-07-30

Proven on the live deployment, not on a merge.

- **The authenticated path was proven on preview first.** The PR's own deployment
  origin was added to the preview branch's Neon Auth trusted domains, the probe ran
  against it, and the origin was removed again. Preview and production run separate
  Neon Auth projects, so the production QA identity does not exist on preview — the
  probe signs up its own throwaway identity when sign-in is refused, which is what
  lets one script run against either.
- **On production:** `pnpm verify:auth` passed. A real sign-in as the QA identity
  filed a match, read it back with the right mode, visit count, dart count, winner
  seat, and roster — including `isYou` on the right seat and the bot's level — and
  the same request without a session was refused with 401.
- **The production database holds it.** `matches` 1, `players` 2, `turns` 1,
  `darts` 1, where all four were 0. The stored visit reads `x01 · complete · leg 1 ·
  1 dart · 40 → 0 · segment 20 × 2`, which is the double twenty that was thrown.
- Browser suite against `https://dartioopus46.vercel.app`: **118 passed, 2 skipped**
  at 390×844, 834×1112, and 1440×1000, run unpiped with the exit code read.

## Found while reviewing this cycle, fixed in cycle 13

**A corrected match would leave the wrong version in history.** Undo and Correct are
gated on whether there is anything to undo, never on whether the match is over, so
they stay live on a finished match in all three mode components. Finishing, then
correcting, then finishing again would file nothing the second time —
`useRecordMatch`'s one-shot guard is set once and never cleared. The record already
written would be the pre-correction one.

The fix is that a finished match is finished, which is already how every scoring
input behaves (`manualInputDisabled` includes `status === "complete"`; the
correction controls were simply never given the same condition).

## What this cycle deliberately did not do

Nothing shows the player their history yet. The read endpoint exists and is tested;
the surface is cycle 13, along with the statistics computed from it. Splitting them
keeps this cycle to one concern — the write — and the account hub wants both.
