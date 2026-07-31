# Cycle 13 — Statistics and the Account Hub

Status: active

Audit gap 14: `/account` showed membership and nothing else, because nothing was
persisted to show. Cycle 12 gave the event log a writer; this turns those rows into
a record a player would actually train against, and puts it on the page.

## What was built

**Career statistics, computed from what was stored** (`src/domain/match-stats.ts`).
`x01PlayerStats` answers "how am I doing in this match" from a live state. This
answers "how do I play" from rows that outlived the match, so it takes the stored
visit shape and nothing else. Both use the same definitions deliberately — a
checkout attempt is *arriving on a finishable score*, not happening to win — and
the test asserts the two agree on the same match rather than trusting that they
still do. That turns a duplicated formula into a checked equivalence.

**The player's own visits, not the household's** (`readStatMatches`). The query
joins from `players` rather than from `matches`, which is what keeps a local
opponent out of the numbers: a two-person match on one phone stores both seats and
only one of them belongs to this account.

**The free/paid split is the catalogue's, not this route's**
(`src/app/api/stats/route.ts`). `PLAN_CATALOG` already said Free carries a 50-match
history window and no `deep_stats`, and that Pro and Club carry neither limit. So
everyone gets matches, wins, and their three-dart average; first nine, checkout
percentage, best visit, best leg, and the mode breakdown are Pro. A locked response
does not contain those figures at all — a client that renders a lock is not a
client that enforces one, and the route test asserts the paid field names are
absent from the Free payload entirely.

**The surface** (`src/components/player-stats.tsx`). Two panels on `/account`:
the numbers, and the last five matches with opponent, result, darts, and date.
Both degrade honestly — a player with no matches is told so rather than shown
zeroes, and an unreadable response says so rather than rendering an empty past.

Stale copy went with it. The page said cross-device history was "coming soon" in
three places; it is here, so those now say what is actually still being built,
which is rooms and Club management.

## A trap avoided rather than repeated

The new cards are styled on their own class names, never on `.account-stats > div`.
Cycle 11 lost 32 px of padding and a whole column layout to exactly that: Navi's
`Surface` does not render the element a descendant selector assumes, so the rule
matched nothing and failed silently.

## Verified receipts — 2026-07-30

- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`,
  **435 tests across 35 files**, up from 418 across 33. Production build green with
  21 routes, up from 19.
- Career statistics were checked against `x01PlayerStats` over the same match:
  three-dart average, first nine, checkout attempts and hits, checkout percentage,
  best visit, busts, visits, and darts all agree.

## Also in this cycle

**A finished match stops offering to rewind itself.** Found reviewing cycle 12 and
described in `CYCLE_12_match_history.md`: Undo and Correct were gated on whether
there was anything to undo, never on whether the match was over, in all three mode
components. Since the record is filed once when a match completes, finishing,
rewinding past the winning dart, and finishing again would have left the
overwritten version in history. Proved with a Shanghai match — single, double and
treble of the round's number wins outright, which makes it the shortest complete
match in the product — and confirmed red against the unfixed component first.

**`verify:history` joined the release ladder.** It was written in a session
scratchpad and it is the only gate that can see past the login wall, where the next
three cycles live.
