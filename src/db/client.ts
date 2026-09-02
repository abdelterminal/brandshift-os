import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";

import * as schema from "./schema";

/**
 * The database handle.
 *
 * Everything here is built on first use rather than on import. `next build`
 * evaluates every route module to collect page data, and the build machine has
 * no `DATABASE_URL` -- so a pool constructed at module scope fails the
 * production build even though nothing ever queried it. Deferring construction
 * means importing this module is free and only a real query needs an
 * environment.
 */

const globalForDb = globalThis as unknown as {
  __brandshiftPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // An idle client erroring out (db restart, network blip) must not take the
  // process down; the pool discards it and the next query gets a fresh one.
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  return pool;
}

/**
 * One pool per process. Next's dev server re-evaluates modules on every edit,
 * so it is parked on `globalThis` to stop HMR opening a new pool each time
 * until Postgres refuses connections.
 */
export function getPool(): Pool {
  if (!globalForDb.__brandshiftPool) {
    globalForDb.__brandshiftPool = createPool();
  }
  return globalForDb.__brandshiftPool;
}

export type Database = ReturnType<typeof createDatabase>;

function createDatabase() {
  return drizzle(getPool(), { schema });
}

let instance: Database | undefined;

function getDb(): Database {
  instance ??= createDatabase();
  return instance;
}

/**
 * Callers write `db.select(...)` as usual; the proxy is only here so that the
 * first property access, not the import, is what builds the pool.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const actual = getDb();
    const value = Reflect.get(actual, property, receiver);
    return typeof value === "function" ? value.bind(actual) : value;
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

/** Close the pool. For scripts (the seed) and tests -- not for request paths. */
export async function closeDb(): Promise<void> {
  const pool = globalForDb.__brandshiftPool;
  if (!pool) return;
  globalForDb.__brandshiftPool = undefined;
  instance = undefined;
  await pool.end();
}

export { schema };
