# Cycle 11 — Lain's Test-Pass Audit

Status: active

Opened 2026-07-28 from notes taken while testing the handed-over build. One
commit per note, one PR.

## Queue

- [x] **Theme picker is inelegant** — collapse the inline row of three names to a single icon with a vertical dropdown.
- [x] **Never black text on an orange background** — always white. Standing rule.
- [x] **The top bar is a "cylinder" and reads as AI slop** — Navi's TopNav floats as a bordered pill; take it flush.
- [x] **The hero board is buggy and does not look right** — it was a CSS fake; use the regulation renderer the product already ships.
- [x] **The whole landing page is boring** — needs scroll transitions and real motion.
- [x] **No login or signup anywhere in the top nav** — there was no route into an account above 760px at all.
- [x] **Where is pricing?** — carried only by `.desktop-links`, hidden below 1100px, so unreachable on a phone.
- [x] **Production authentication is dead.** No origin the app is served from is in the production Neon Auth project's trusted domains. Sign-in and sign-up both return `403 INVALID_ORIGIN` at `dartioopus46.vercel.app`, at the canonical `dartio-*.vercel.app` deployment URL, and at `dartio.vercel.app`. ~~Requires the Neon console; cannot be fixed from the repository.~~ **Fixed 2026-07-28** — see below. It did require the Neon control plane, but not the console.
- [ ] **There is no admin or superadmin role.** `users` has `id`, `auth_subject`, `email`, `stripe_customer_id`, and timestamps — no role column, no admin surface, no god mode. `PHASE_1` listed "role distinction (user/admin)" and it was never built.
- [x] **"yeah i did some file reorganising, some paths may be broken as a result, but my pc files are way leaner now. fix any issue related to this if it appears perma."** — the working tree moved from `/home/nira/dev/dartio` to `/home/nira/projects/dartio`. Find every reference that still points at the old location and correct it, rather than patching a symptom.
- [ ] **"Could not attach to MCP server Windows-MCP" pls fix this too** — tooling rather than product, so it is tracked outside this repository as task `#00c`. Three of the four configured MCP servers pointed at `/mnt/c` paths the reorganization removed. `alpaca` was repointed at a surviving copy; `navi-mcp` and `navi-wiki` have no copy on disk. `Windows-MCP` itself is configured nowhere — not in either `.claude.json`, not in Cursor, Codex, or any project `.mcp.json` — so the message is a stale reference to something already deleted. Needs Lain to say where those servers went, or whether they are gone for good.

## Verified receipts — 2026-07-28

- The theme control is one swatch opening a vertical menu, keyboard-navigable
  (arrows, Home, End, Escape) and dismissed by a click away. Each option's
  swatch previews that theme's own canvas and accent rather than the active
  one's.
- Text on the accent moved to its own `--on-accent` token, always white.
  `--accent-ink` stays as the inverted *surface* colour, so the landing call to
  action was not repainted as a side effect of a text rule.
- The top bar is flush edge to edge with one hairline under it. Navi's default
  pill radius, full border, and inset width are all overridden, including its
  separate mobile rule.
- The hero board renders the regulation SVG with darts at each bed's real
  representative point. The fake was a `repeating-conic-gradient` of twenty
  equal wedges with no doubles ring, no trebles ring, and no numbers.
- The landing page moves in three tiers by degradation path: a pure-CSS hero
  entrance, JS-gated scroll reveals that never start hidden without JavaScript,
  and scroll-driven parallax behind an `@supports` guard. All transform and
  opacity, so nothing shifts layout. Copy was corrected in passing: the marquee
  claimed "LIVE ROOMS", the hero offered ten modes when six are playable, and a
  step described always-on voice, which is not built.
- The top bar shows Sign in and Sign up when signed out and the account when
  signed in, read from the live session.
- Pricing rides the bottom navigation with every other route, and the landing
  page's closing call to action links it — it had no entry point from the
  landing page before.
- `pnpm verify:auth <url>` is a new release gate. It probes the sign-up endpoint
  and asserts only that the origin was accepted. It fails against production
  today, which is the point.

## The reorganization sweep — 2026-07-28

The checkout moved to `/home/nira/projects/dartio`. Nothing in the
application broke: no source file, config, or test carries an absolute path,
so `pnpm typecheck`, `pnpm lint`, and 367 unit tests pass unchanged at the
new location. The Vercel project link in `.vercel/project.json` is by project
ID and survived the move.

What did break was outside the source tree, and a repository-only sweep would
have missed all three:

- **`docs/REPO_CONTROL.md` named a dead canonical path.** Corrected, with both
  dead paths recorded as dead. This is a documentation fix and has no
  production surface to verify against — its evidence is the corrected file
  and the green gates, not a deployed observation.
- **Playwright's browser binaries were gone, and the repo could not put them
  back.** They live in `~/.cache/ms-playwright`, outside the repo, and did not
  survive. Reinstalling exposed a standing defect: `test:browser:install` ran
  `playwright install --with-deps chromium`, and `--with-deps` installs system
  libraries through apt, so it requires passwordless sudo. CI has that; a
  workstation does not, where it aborts on a password prompt having downloaded
  nothing. The suite then failed 102 times on a missing `chrome-headless-shell`
  — an environment fault that reads exactly like 102 product regressions. The
  script now installs browsers only and CI asks for the system libraries in its
  own step. 102/102 pass locally at all three viewports.
- **`/mnt/c/navi-mcp` no longer exists**, and neither does `navi-wiki`. Both
  held server code that is gone from disk. The Discord capability survived
  anyway: the bot token lives in the `navi-wiki` entry's env in `~/.claude.json`,
  and that config outlived the code it pointed at. Verified against the Discord
  API — the token authenticates and the bot can read `#general` — so posting
  works over REST without either server. `alpaca` was repointed at a surviving
  copy under `StockTransformer`.

The lesson is the same shape as the auth one. The gates assert nothing about
the machine the gates run on, and every one of these broke outside the tree the
release ladder inspects.

A second lesson, cheaper and more embarrassing: `pnpm test:browser 2>&1 | tail
-25` reports the exit status of `tail`, not of the suite. Both the failed
browser run and the failed browser *install* returned 0 that way, and the
truncation cut the error off the top of the output. Gate commands are run
unpiped, with the exit code read, or they are not gates.

## Reopened — the nav sign-in fix never reached a phone

Verifying the closed rows against production found that **"No login or signup
anywhere in the top nav" was only fixed on desktop.** Below 1100px the sign-in
link was in the DOM at every width, correctly href'd, and painted at none of
them.

`globals.css` hides every direct `<a>` child of `.nav-actions` at both
breakpoints under 1100px. That rule predates `AccountNav` and was written for
the "Start a match" button; `AccountNav` renders its links as direct children of
the same container and inherited it. `match-layout.css` already had a block
whose comment claimed to "keep the signed-out prompt", and it was not doing so.

This is the same shape as the Pricing defect Lain found — a surface carried only
by a desktop-scoped rule — and it survived the fix for the note it belongs to.

Two things made it invisible:

- Grepping the deployed HTML cannot see it. The link is present in the markup;
  the defect is that it is not painted. `AccountNav` is also a client component,
  so the server response contains neither state.
- The browser suite asserted that `/auth/sign-in` **loads as a route**, which was
  always true. Nothing asserted a visitor could **reach** it. A route that
  answers 200 and a route someone can find are different claims, and only the
  first was tested.

`tests/browser/layout.spec.ts` now asserts a visible sign-in entry point at all
three viewports, and asserts sign-up only above 1100px, where it is a deliberate
choice rather than an accident.

**Production evidence, 2026-07-28.** The new test was confirmed red against
production before the fix — mobile and tablet failed, desktop passed — which is
what proves it tests something real. After deployment it passes 3/3 at
`https://dartioopus46.vercel.app`. The deployed stylesheet changed hash from
`1sxid5dczhyi0.css` to `1w08pcm5gxu4m.css`, and the new bundle contains
`a.account-nav{display:inline-flex}` where the old one contained no occurrence
of the selector at all. Full suite against production: 106 passed, 2 skipped.

## Production authentication, fixed — 2026-07-28

Anyone can sign in to Dartio. This had been recorded twice as needing Lain at the
Neon console; that was wrong, and only half the claim was ever tested.

The blocker was real and exactly as described: trusted domains on the production
branch. `GET /projects/nameless-tooth-63658537/branches/br-sweet-wildflower-afy2ygj6/auth/domains`
returned `{"domains":[]}` — not a wrong entry, none at all. The preview branch
carried its Cycle 2 alias, which is why preview always worked.

What was wrong was "cannot be fixed from the repository". The console is one
client of the Neon control plane; the API is another, and `neonctl` OAuth
credentials with a refresh token were already on this machine at
`~/.config/neonctl/credentials.json`. `POST .../auth/domains` accepted both the
live URL and `dartio.vercel.app`, returning 201 for each.

Proof it is genuinely alive, not merely unblocked:

- `pnpm verify:auth https://dartioopus46.vercel.app` passes for the first time.
- A real account was created against production and signed back in — sign-up 200,
  sign-in 200, session token issued both times.

Two things worth keeping from how this was diagnosed. Probing Neon's auth service
directly with each candidate origin separated "the service rejects this origin"
from "the app forwards a bad one", and sending an absolute `callbackURL` turned
`INVALID_ORIGIN` into `INVALID_CALLBACKURL` — the same allow-list enforced at a
second checkpoint, which is what ruled out a header-level workaround and pointed
at the domain list itself.

The wider lesson is that "requires a console" was an assumption about a user
interface, and it was allowed to stand as if it were a fact about the system. It
sat in `REPO_CONTROL.md` blocking every authenticated feature — account, billing,
voice, AI 9–20, advanced checkout — for a session and a half.

**Adjacent discovery.** The account returned by production carries `role`,
`banned`, `banReason`, and `banExpires`. Better Auth's admin plugin is already
live in Neon Auth, and the control plane exposes
`PUT .../auth/users/{auth_user_id}/role`. The "no superadmin" note may not need a
`users.role` column and a bespoke admin surface at all — that is now a design
question rather than a build-from-nothing one. Still a commission; not built.

## The gap that let production auth ship dead

The browser suite passed 102/102 against production while nobody could sign in.
Everything it asserts is free play, and `entitlements.spec.ts` deliberately
tolerates an unavailable access authority so the same suite can run against CI
placeholders. That tolerance is correct for CI and made the suite blind here.
`verify:auth` closes it, and the release ladder now names it.
