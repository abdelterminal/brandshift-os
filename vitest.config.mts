import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside the `react-server` condition,
      // which Vitest does not apply. Server modules are exactly what these
      // tests exercise, so the marker resolves to its own no-op build instead.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Playwright owns e2e; vitest must not try to run those specs.
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    // Unit tests build queries and assert on the SQL; they never connect, but
    // importing the db module validates the environment, so give it one.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://vitest:vitest@127.0.0.1:5432/vitest",
      JWT_SECRET: "test-secret-that-is-at-least-32-characters",
      SESSION_TTL: "7d",
    },
  },
});
