# Cycle 19 — Cycle 11's Remainder

Status: active

Seven rows were still open in `CYCLE_11_lain_audit.md`. Five of them had already
been fixed by commit `49916f0` and never ticked — a doc lying about the product in
the safe direction, which is still lying. One was genuinely open. One is a decision
rather than a build.

## Ticked against production, not against the diff

Account card padding, the site-wide type scale, the board bleeding over the
checkout companion, and the command dock's padding are all visible and correct in
screenshots of the live deployment taken this session. Each row now says so.

## The one that was really still open

**"not utilizing max screenspace for me."** Measured on production at 1440×1000:
the document ran to **1229 px** inside a 1000 px viewport and the command dock sat
at **y=1036** — Undo and Correct below the fold, on the one screen a player uses
standing up.

Three causes, each found by measuring rather than by reading the CSS:

1. **`#main-content` and `.match-page` reserved `100vh − 76px`** for the nav, but
   the stage begins 38 px below the nav. The reservation overshot the viewport by
   exactly that difference. Both now subtract a named `--stage-inset` as well, and
   use `dvh` so a phone's address bar cannot reproduce it.
2. **`.match-page` had a `min-height` and no height**, so `flex: 1` on the grid had
   nothing to distribute and the grid took its content size instead. It has a real
   height now. Worth recording: **the board was never the constraint** — the middle
   column was, stacking the checkout companion, the per-dart card and the voice
   console past the height available. It scrolls inside the grid rather than growing
   the page.
3. **Navi's shell reserves room beneath the main area for the bottom navigation**,
   which only exists below 1100 px. On a desktop that reservation is canvas nothing
   ever occupies.

Measured again afterwards: **document height 1000 px in a 1000 px viewport**, dock
ending exactly at the bottom edge. `tests/browser/layout.spec.ts` asserts both, so
it cannot drift back without the suite going red.

## The admin role — decided

`users` needs no `role` column and Dartio needs no admin surface of its own. Neon
Auth already runs Better Auth's admin plugin, with `role`, `banned`, `banReason`
and `banExpires` on the account and a control-plane endpoint to set the role. A
second, weaker copy inside Dartio would leave two answers to who is an
administrator.

**"im free plan...??" was correct behaviour.** Role and entitlement are separate on
purpose: being an administrator is not a subscription. Making a role grant paid
entitlements would mean paid access could be handed out with no billing record —
precisely the coupling the server-owned access snapshot exists to prevent.

Whether an administrator should see an admin surface, and what belongs on it, is a
product decision. It is a commission and it is not built.

## Still open, and not ours to close

The MCP tooling row. `navi-mcp` and `navi-wiki` have no copy on disk and
`Windows-MCP` is configured nowhere; the Discord capability survives on the token
that outlived them. It needs Lain to say whether those servers are gone for good.

## Verified receipts — 2026-07-31

- The before and after measurements above, both taken in a real browser at
  1440×1000 — the first against production, the second against the built site.
- Deterministic gates: TypeScript clean, ESLint clean at `--max-warnings=0`.
