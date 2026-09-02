import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the end-to-end suite keeps its data.
 *
 * The same Postgres the app uses, a different database. Tests complete tasks
 * and publish projects; pointing them at the development database would mean
 * running the suite destroys whatever you were looking at, and a suite that
 * costs you your data is one people stop running.
 *
 * `.env` is parsed here rather than loaded through `src/lib/env.ts` because
 * this file is imported by `playwright.config.ts`, which is evaluated before
 * anything else and outside the app's module graph.
 */

export const TEST_DATABASE = "brandshift_test";

function parseDotEnv(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  } catch {
    throw new Error("No .env file. Copy .env.example to .env before running the e2e suite.");
  }

  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

export const dotEnv = parseDotEnv();

/** The development connection string, used to reach the server and create the test database. */
export const adminDatabaseUrl = dotEnv.DATABASE_URL ?? "";

/** The same server, pointed at `brandshift_test`. */
export const testDatabaseUrl = (() => {
  if (!adminDatabaseUrl) {
    throw new Error("DATABASE_URL is missing from .env.");
  }
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${TEST_DATABASE}`;
  return url.toString();
})();

/** Environment the test server and the seed script both run with. */
export const testEnv: Record<string, string> = {
  ...dotEnv,
  DATABASE_URL: testDatabaseUrl,
  NODE_ENV: "development",
};
