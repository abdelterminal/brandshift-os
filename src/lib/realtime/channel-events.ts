import "server-only";

import { Client } from "pg";

import { env } from "@/lib/env";

/**
 * Live channel updates, without new infrastructure.
 *
 * This deployment is Docker Compose on a local network: one Next container and
 * one Postgres. Adding Redis or a websocket gateway to make a chat box feel
 * live would be more moving parts than the feature is worth, and every one of
 * them is something that can be down at 9am on a Monday.
 *
 * So the database is the bus. A write calls `pg_notify`; one long-lived
 * `LISTEN` connection per process receives it and hands it to whichever
 * browsers are currently subscribed over Server-Sent Events. Postgres was
 * already required, already running, and already the thing the write went to.
 *
 * SSE rather than websockets because the traffic is one-way -- the server tells
 * the browser something changed, the browser refetches through the same server
 * components everyone else gets. There is no second rendering path to keep in
 * step with the first, which is the usual way a live feed starts disagreeing
 * with the page it lives on.
 */

/** One channel for all of it. The payload says which org and which room. */
const NOTIFY_CHANNEL = "brandshift_channel_change";

export type ChannelChange = {
  organizationId: string;
  channelId: string;
};

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Tell everyone watching that a channel moved.
 *
 * Deliberately says nothing about *what* changed. The subscriber refetches the
 * feed the same way a page load would, so a live update and a refresh cannot
 * show different things -- and a message never travels as a second, cheaper
 * copy of itself that has to be kept in step with the real one.
 */
export async function publishChannelChange(
  organizationId: string,
  channelId: string,
): Promise<void> {
  const { getPool } = await import("@/db/client");
  const payload = JSON.stringify({
    organizationId,
    channelId,
  } satisfies ChannelChange);

  try {
    await getPool().query("select pg_notify($1, $2)", [NOTIFY_CHANNEL, payload]);
  } catch (error) {
    // A live update that fails to publish costs somebody a manual refresh. It
    // must never cost them the message they just sent, which is already
    // committed by the time this runs.
    console.error("[realtime] could not publish a channel change", error);
  }
}

// ---------------------------------------------------------------------------
// Subscribing
// ---------------------------------------------------------------------------

type Listener = (change: ChannelChange) => void;

type Hub = {
  listeners: Set<Listener>;
  client?: Client;
  connecting?: Promise<void>;
};

/**
 * One hub per process, parked on `globalThis` for the same reason the pool is:
 * the dev server re-evaluates modules on every edit, and a new `LISTEN`
 * connection per edit would exhaust Postgres long before you noticed.
 */
const globalForRealtime = globalThis as unknown as { __brandshiftHub?: Hub };

function hub(): Hub {
  globalForRealtime.__brandshiftHub ??= { listeners: new Set() };
  return globalForRealtime.__brandshiftHub;
}

/**
 * A dedicated connection, not one borrowed from the pool.
 *
 * `LISTEN` binds to a session, and a pooled client is handed back to the pool
 * the moment the query finishes -- so a subscription taken out on one would
 * quietly stop receiving, or worse, deliver another request's notifications.
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
        const change = JSON.parse(message.payload) as ChannelChange;
        for (const listener of hub().listeners) listener(change);
      } catch (error) {
        console.error("[realtime] unreadable notification payload", error);
      }
    });

    // A dropped connection means silence, which looks exactly like "nothing is
    // happening" -- the worst failure mode a live feed has. Drop the handle so
    // the next subscriber reconnects rather than attaching to a dead socket.
    client.on("error", (error) => {
      console.error("[realtime] listener connection error", error);
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
 * Watch one organization's channels. Returns the function that stops watching,
 * which the SSE route calls when the browser goes away.
 */
export async function subscribeChannelChanges(
  organizationId: string,
  onChange: (change: ChannelChange) => void,
): Promise<() => void> {
  await connect();

  const listener: Listener = (change) => {
    // Scoped here as well as in every query behind it: a notification is the
    // one place in this app where data moves without a `withOrg()` in front of
    // it, so the tenant check is written explicitly rather than assumed.
    if (change.organizationId !== organizationId) return;
    onChange(change);
  };

  hub().listeners.add(listener);
  return () => {
    hub().listeners.delete(listener);
  };
}
