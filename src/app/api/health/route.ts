import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";

/**
 * Liveness plus database readiness. Docker Compose polls this to decide when
 * the app container is actually serving, so it must never be cached and must
 * answer quickly even while the database is down.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEOUT_MS = 2_000;

type Health = {
  status: "ok" | "degraded";
  database: { reachable: boolean; latencyMs: number | null };
  uptimeSeconds: number;
  timestamp: string;
};

export async function GET() {
  const startedAt = performance.now();

  let database: Health["database"];
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database check timed out")), TIMEOUT_MS),
      ),
    ]);
    database = { reachable: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    // This endpoint is unauthenticated, so the reason stays in the server log.
    // Callers get the fact, not the connection string or the driver's message.
    console.error("[health] database check failed", error);
    database = { reachable: false, latencyMs: null };
  }

  const body: Health = {
    status: database.reachable ? "ok" : "degraded",
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    // 503 while the database is unreachable, so the container is not routed to.
    status: database.reachable ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
