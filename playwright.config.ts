import { defineConfig, devices } from "@playwright/test";

/**
 * Browser proof for Dartio.
 *
 * Every viewport, geometry, and theme claim in `docs/` was previously produced
 * by an ad-hoc external session and could not be re-run — see gap 15 in
 * `docs/artifacts/GAP_AUDIT_2026-07-28.md`. These are the same checks as
 * executable tests, at the three exact widths the phase has always been proven
 * against: a phone, a tablet, and a desktop.
 *
 * Point `DARTIO_BASE_URL` at a preview or production deployment to run the same
 * suite against a real environment; with it unset, Playwright builds and serves
 * the app locally.
 */
const baseURL = process.env.DARTIO_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: "retain-on-failure" },

  // The exact widths every prior proof used, so a regression here means the
  // same thing it meant in the deployed stories.
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
  ],

  webServer: process.env.DARTIO_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start --port 3100",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
