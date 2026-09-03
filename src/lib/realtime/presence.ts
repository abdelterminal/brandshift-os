import "server-only";

/**
 * Who is looking at a channel right now.
 *
 * Presence is derived from the SSE connections this process is holding open,
 * not from a heartbeat table. A browser that has the channel open has a socket
 * here; when the tab closes, the socket closes, and the avatar goes. There is
 * nothing to expire and nothing to clean up after a crash, because the
 * evidence and the fact are the same thing.
 *
 * The trade this makes: presence is per process. One container is what this
 * deployment runs, and the day it runs two, two people on different containers
 * will not see each other in the "viewing now" row -- messages will still be
 * delivered to both, because those go through Postgres. It is recorded in
 * `KNOWN-GAPS.md` rather than solved with infrastructure nobody has yet.
 */

export type Viewer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

type Connection = Viewer & { organizationId: string; channelId: string };

type Registry = {
  connections: Map<string, Connection>;
  listeners: Map<string, Set<(viewers: Viewer[]) => void>>;
};

/** Parked on `globalThis` so HMR does not hand out a fresh, empty registry. */
const globalForPresence = globalThis as unknown as {
  __brandshiftPresence?: Registry;
};

function registry(): Registry {
  globalForPresence.__brandshiftPresence ??= {
    connections: new Map(),
    listeners: new Map(),
  };
  return globalForPresence.__brandshiftPresence;
}

/**
 * Everyone currently in a channel, one entry per person.
 *
 * Deduplicated by user: two tabs is one person, and showing them twice would
 * make the room look busier than it is.
 */
export function viewersOf(organizationId: string, channelId: string): Viewer[] {
  const seen = new Map<string, Viewer>();

  for (const connection of registry().connections.values()) {
    if (connection.organizationId !== organizationId) continue;
    if (connection.channelId !== channelId) continue;
    seen.set(connection.userId, {
      userId: connection.userId,
      name: connection.name,
      avatarUrl: connection.avatarUrl,
    });
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function announce(organizationId: string, channelId: string): void {
  const viewers = viewersOf(organizationId, channelId);
  for (const listener of registry().listeners.get(channelId) ?? []) listener(viewers);
}

/** Register a viewer. Returns the function that removes them again. */
export function enter(connection: Connection): () => void {
  const id = crypto.randomUUID();
  registry().connections.set(id, connection);
  announce(connection.organizationId, connection.channelId);

  return () => {
    registry().connections.delete(id);
    announce(connection.organizationId, connection.channelId);
  };
}

/** Watch one channel's roster. Returns the function that stops watching. */
export function onPresence(channelId: string, handler: (viewers: Viewer[]) => void): () => void {
  const listeners = registry().listeners;
  const set = listeners.get(channelId) ?? new Set();
  set.add(handler);
  listeners.set(channelId, set);

  return () => {
    set.delete(handler);
    if (set.size === 0) listeners.delete(channelId);
  };
}
