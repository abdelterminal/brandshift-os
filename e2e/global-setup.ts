import { spawnSync } from "node:child_process";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

import { TEST_DATABASE, adminDatabaseUrl, testDatabaseUrl, testEnv } from "./database";

/**
 * Builds the world the suite runs against: a dedicated database, migrated and
 * freshly seeded.
 *
 * Rebuilding it every run is the point. The specs complete tasks and publish
 * projects, so without this the second run would meet the first run's leftovers
 * and start failing for reasons that have nothing to do with the code.
 */
export default async function globalSetup() {
  await createDatabaseIfMissing();
  await runMigrations();
  runSeed();
}

/** `CREATE DATABASE` cannot run inside a transaction, so it gets its own client. */
async function createDatabaseIfMissing() {
  const url = new URL(adminDatabaseUrl);
  // Connect to the maintenance database; you cannot create a database from
  // inside the one you are creating.
  url.pathname = "/postgres";

  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  try {
    const { rows } = await client.query("select 1 from pg_database where datname = $1", [
      TEST_DATABASE,
    ]);

    if (rows.length === 0) {
      // The name is a constant in this file, not user input, so interpolating
      // it is safe -- and `CREATE DATABASE` takes no parameters anyway.
      await client.query(`create database "${TEST_DATABASE}"`);
      console.log(`[e2e] created database ${TEST_DATABASE}`);
    }
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("[e2e] migrations applied");
  } finally {
    await pool.end();
  }
}

/**
 * The seed is a standalone script, so it is run as one -- with the environment
 * overridden rather than `.env` loaded, which is what keeps it pointed at the
 * test database instead of the development one.
 */
function runSeed() {
  // One command string rather than a command plus an args array: passing both
  // alongside `shell: true` makes Node warn about unescaped arguments, and
  // `shell` is needed for `npx` to resolve on Windows.
  const result = spawnSync("npx tsx --conditions=react-server src/db/seed.ts", {
    env: { ...process.env, ...testEnv },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(`[e2e] seed failed:\n${result.stdout}\n${result.stderr}`);
  }

  console.log("[e2e] seeded");
}
