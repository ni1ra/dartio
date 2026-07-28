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
- [ ] **Production authentication is dead.** No origin the app is served from is in the production Neon Auth project's trusted domains. Sign-in and sign-up both return `403 INVALID_ORIGIN` at `dartioopus46.vercel.app`, at the canonical `dartio-*.vercel.app` deployment URL, and at `dartio.vercel.app`. **Requires the Neon console; cannot be fixed from the repository.**
- [ ] **There is no admin or superadmin role.** `users` has `id`, `auth_subject`, `email`, `stripe_customer_id`, and timestamps — no role column, no admin surface, no god mode. `PHASE_1` listed "role distinction (user/admin)" and it was never built.
- [ ] **"yeah i did some file reorganising, some paths may be broken as a result, but my pc files are way leaner now. fix any issue related to this if it appears perma."** — the working tree moved from `/home/nira/dev/dartio` to `/home/nira/projects/dartio`. Find every reference that still points at the old location and correct it, rather than patching a symptom.

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

## The gap that let production auth ship dead

The browser suite passed 102/102 against production while nobody could sign in.
Everything it asserts is free play, and `entitlements.spec.ts` deliberately
tolerates an unavailable access authority so the same suite can run against CI
placeholders. That tolerance is correct for CI and made the suite blind here.
`verify:auth` closes it, and the release ladder now names it.
