import { defineConfig } from "@playwright/test";
/** Frontend-only verification against the existing local server. No seed/reset/setup. */
export default defineConfig({
  testDir: "./e2e/frontend",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", headless: true },
  reporter: "list",
});
