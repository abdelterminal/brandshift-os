import "server-only";

import { Client } from "pg";

import { env } from "@/lib/env";

import type { LiveTopic } from "./live-topics";

/**
 * The app-wide "something changed, refetch" signal.
 *
 * The same design as the channel bus next door (`channel-events.ts`), for the
 * same reasons: this deployment is one Next container and one Postgres on a
 * local network, so the database is the message bus rather than a new service
 * that can be down on a Monday. A write calls `pg_notify`; one long-lived
 * `LISTEN` connection per process receives it and hands it to whichever
 * browsers are currently subscribed over Server-Sent Events.
 *
 * It is a *second* dedicated connection rather than a shared one with the
 * channel bus: the two features stay independent, so a bug in one cannot
 * silence the other, and each is a handful of lines that reads on its own.
 *
 * The notification deliberately says only which org and which topic -- never
 * the row. The subscriber refetches through the same server components a page
 * load uses, so a live update and a refresh are produced by one code path and
 * cannot drift apart.
 */

const NOTIFY_CHANNEL = "brandshift_live";

export type LiveChange = {
  organizationId: string;
  topic: LiveTopic;
};

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Announce a tenant write. Fire-and-forget: a live update that fails to publish
 * costs somebody a manual refresh, and must never cost them the write itself,
 * which is already committed by the time this runs.
 */
export async function publishLiveChange(
  organizationId: string,
  topic: LiveTopic,
): Promise<void> {
  const { getPool } = await import("@/db/client");
  const payload = JSON.stringify({ organizationId, topic } satisfies LiveChange);

  try {
    await getPool().query("select pg_notify($1, $2)", [NOTIFY_CHANNEL, payload]);
  } catch (error) {
    console.error("[realtime] could not publish a live change", error);
  }
}

// ---------------------------------------------------------------------------
// Subscribing
// ---------------------------------------------------------------------------

type Listener = (change: LiveChange) => void;

type Hub = {
  listeners: Set<Listener>;
  client?: Client;
  connecting?: Promise<void>;
};

/**
 * One hub per process, parked on `globalThis` for the same reason the pool is:
 * the dev server re-evaluates modules on every edit, and a fresh `LISTEN`
 * connection per edit would exhaust Postgres long before you noticed.
 */
const globalForLiveBus = globalThis as unknown as { __brandshiftLiveHub?: Hub };

function hub(): Hub {
  globalForLiveBus.__brandshiftLiveHub ??= { listeners: new Set() };
  return globalForLiveBus.__brandshiftLiveHub;
}

/**
 * A dedicated connection, not one borrowed from the pool: `LISTEN` binds to a
 * session, and a pooled client is handed back the moment its query finishes.
 */
async function connect(): Promise<void> {
  const current = hub();
  if (current.client) return;
  if (current.connecting) return current.connecting;

  current.connecting = (async () => {
    const client = new Client({ connectionString: env().DATABASE_URL });

    client.on("notification", (message) => {
      if (message.channel !== NOTIFY_CHANNEL || !message.payload) return;
      try {
        const change = JSON.parse(message.payload) as LiveChange;
        for (const listener of hub().listeners) listener(change);
      } catch (error) {
        console.error("[realtime] unreadable live payload", error);
      }
    });

    // A dropped connection means silence, which looks exactly like "nothing is
    // happening". Drop the handle so the next subscriber reconnects rather than
    // attaching to a dead socket.
    client.on("error", (error) => {
      console.error("[realtime] live listener connection error", error);
      hub().client = undefined;
      void client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`listen ${NOTIFY_CHANNEL}`);
    hub().client = client;
  })().finally(() => {
    hub().connecting = undefined;
  });

  return current.connecting;
}

/**
 * Watch one organization's changes. Returns the function that stops watching,
 * which the SSE route calls when the browser goes away.
 */
export async function subscribeLiveChanges(
  organizationId: string,
  onChange: (change: LiveChange) => void,
): Promise<() => void> {
  await connect();

  const listener: Listener = (change) => {
    // Scoped here as well as in every query behind it: a notification is the
    // one place data moves without a `withOrg()` in front of it, so the tenant
    // check is written explicitly rather than assumed.
    if (change.organizationId !== organizationId) return;
    onChange(change);
  };

  hub().listeners.add(listener);
  return () => {
    hub().listeners.delete(listener);
  };
}
