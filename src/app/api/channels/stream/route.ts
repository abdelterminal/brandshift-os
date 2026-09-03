import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { subscribeChannelChanges } from "@/lib/realtime/channel-events";
import { enter, onPresence, viewersOf } from "@/lib/realtime/presence";

/**
 * The live channel stream.
 *
 * One Server-Sent Events connection per open channel. It carries two things:
 *
 *   `change`   -- something happened in this channel; refetch.
 *   `presence` -- who is looking at it right now.
 *
 * A `change` deliberately carries no message in it. The browser refetches
 * through the same server components a page load uses, so what arrives live
 * and what arrives on a refresh are produced by one code path and cannot drift
 * apart. It costs a round trip and buys never having to reconcile two renders
 * of the same conversation.
 *
 * This lives under `/api`, which the middleware matcher excludes, so the
 * session is checked here rather than in front of it.
 */

/** A held-open connection is the opposite of a cached response. */
export const dynamic = "force-dynamic";

/**
 * Proxies and browsers hang up on a quiet connection. A comment line every
 * twenty-five seconds keeps it open and costs two bytes.
 */
const HEARTBEAT_MS = 25_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const session = await getCurrentUser();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!can(session.actor, "channel.view")) return new Response("Forbidden", { status: 403 });

  const channelId = new URL(request.url).searchParams.get("channel");
  if (!channelId || !UUID_RE.test(channelId)) {
    return new Response("Bad Request", { status: 400 });
  }

  const { actor, user } = session;
  const encoder = new TextEncoder();

  /**
   * Everything this connection has to undo. Collected in one list rather than
   * one variable each, because a stream can be cancelled halfway through
   * setting itself up and every one of them still has to run.
   */
  const teardown: Array<() => void> = [];
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  function close(): void {
    if (!open) return;
    open = false;
    while (teardown.length > 0) teardown.pop()?.();

    // Close the stream as well as stop writing to it. Leaving it open after
    // the browser has gone makes the server log "the destination stream closed
    // early" on every navigation away from a channel -- a real error message
    // for something that is simply somebody closing a tab, which is exactly
    // the kind of noise that trains people to ignore their own logs.
    try {
      controller?.close();
    } catch {
      // Already closing, because `cancel` got here first.
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;

      function send(event: string, data: unknown): void {
        if (!open) return;
        try {
          streamController.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The browser went away between the check and the write. `cancel`
          // is about to run and tear down the rest.
          open = false;
        }
      }

      // Presence first, so the person who has just arrived is in the roster
      // that everyone -- including them -- receives.
      teardown.push(
        enter({
          organizationId: actor.organizationId,
          channelId,
          userId: actor.userId,
          name: user.name,
          avatarUrl: user.avatarUrl,
        }),
      );
      teardown.push(onPresence(channelId, (viewers) => send("presence", { viewers })));
      send("presence", { viewers: viewersOf(actor.organizationId, channelId) });

      void subscribeChannelChanges(actor.organizationId, (change) => {
        if (change.channelId !== channelId) return;
        send("change", { channelId: change.channelId });
      })
        .then((unsubscribe) => {
          // It can finish connecting after the browser has already gone.
          if (!open) unsubscribe();
          else teardown.push(unsubscribe);
        })
        .catch((error) => {
          console.error("[realtime] could not subscribe", error);
        });

      const heartbeat = setInterval(() => {
        if (!open) return;
        try {
          streamController.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          open = false;
        }
      }, HEARTBEAT_MS);
      teardown.push(() => clearInterval(heartbeat));
    },

    /** Fires when the browser disconnects, which is when they stop being present. */
    cancel() {
      close();
    },
  });

  // Belt and braces: some runtimes abort the request without cancelling the
  // stream, and a presence entry that outlives its browser is a ghost in the
  // room nobody can get rid of.
  request.signal.addEventListener("abort", close);

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx buffers by default, which turns a live stream into a very late
      // one. Harmless when nothing is proxying.
      "x-accel-buffering": "no",
    },
  });
}
