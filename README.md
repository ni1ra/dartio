# Dartio

A darts scoring, practice and multiplayer web app. Live at https://dartioopus46.vercel.app

Matches are recorded by tapping the dartboard, typing a turn score, entering each dart, or by voice. Every dart is stored, so finished matches can be replayed and feed per-player statistics.

## Features

- **Game modes:** X01 (configurable start score, legs and sets, straight/double/master in and out), Cricket (standard, cut-throat, tactics), Around the Clock, Shanghai, Count-Up.
- **Practice:** Bob's 27, Checkout Lab, Doubles Matrix, Scoring Sprint, and a custom practice builder.
- **AI opponent:** levels 1 to 20, with target selection that depends on the level; available in X01, Cricket and the round modes. Free accounts reach level 8.
- **Checkout helper:** suggested finishing routes, alternatives and setup shots for X01.
- **Voice scoring:** push-to-talk or always-on; audio is transcribed with OpenAI and parsed into darts, turn scores, undo and confirm.
- **Online rooms:** join by room code, server-validated turns, spectators, host handover, reconnect.
- **Accounts:** match history, statistics and replay; Free, Pro and Club plans billed through Stripe.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Postgres on Neon with Drizzle ORM, Neon Auth, Stripe, Zod, Vitest, Playwright. Game rules live in pure modules under `src/domain`.

## Local setup

Requires Node 22 or newer and pnpm 11.9.

    pnpm install
    cp .env.example .env.local        # then fill in the values
    DATABASE_URL=<postgres url> pnpm exec drizzle-kit migrate
    pnpm dev

Environment variables (see `.env.example`): `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `OPENAI_API_KEY`, `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_CLUB_MONTHLY_PRICE_ID`, `STRIPE_CLUB_ANNUAL_PRICE_ID`, `NEXT_PUBLIC_APP_URL`.

## Tests

    pnpm typecheck
    pnpm lint
    pnpm test                  # Vitest unit and route tests
    pnpm test:browser:install  # once
    pnpm test:browser          # Playwright at 390, 834 and 1440 px wide

Set `DARTIO_BASE_URL` to run the browser suite against a deployed instance instead of a local build. GitHub Actions runs typecheck, lint, unit tests, build and the browser suite on pushes and pull requests to `main`.
