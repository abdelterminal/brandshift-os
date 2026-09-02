import { defineConfig, devices } from "@playwright/test";

import { testDatabaseUrl } from "./e2e/database";

/**
 * End-to-end tests.
 *
 * Two things matter about this setup:
 *
 * 1. **They run against their own database.** `e2e/global-setup.ts` creates and
 *    seeds `brandshift_test`; the dev database is never touched. A test suite
 *    that destroys the data you were working with is a suite people stop
 *    running.
 *
 * 2. **They run a production build on port 3100.** Not `next dev`: Next refuses
 *    to start a second dev server for the same project, so the suite would
 *    fight whatever you already had open. Building also means the suite tests
 *    what actually ships rather than the dev server.
 *
 * Sign-in happens once per role in `auth.setup.ts` and is reused as saved
 * storage state, so no spec spends thirty seconds typing a password.
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  // The suite mutates data -- it completes tasks and publishes projects -- so
  // it runs serially against one seeded database rather than racing itself.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Deterministic locale and timezone: "overdue" depends on the date, and the
    // organization keeps its deadlines in Paris time.
    locale: "en-GB",
    timezoneId: "Europe/Paris",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    {
      name: "anonymous",
      testMatch: /anonymous\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "manager",
      testMatch: /manager\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/manager.json" },
    },
    {
      name: "member",
      testMatch: /member\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/member.json" },
    },
  ],

  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Computed synchronously, because `webServer` is configured while this
      // file is evaluated -- before the global setup has run.
      //
      // Next loads `.env` too, but `@next/env` leaves an existing process
      // variable alone, so this wins and the server talks to the test database.
      DATABASE_URL: testDatabaseUrl,
    },
  },
});
