import { getCurrentUser } from "@/lib/auth/session";
import { subscribeLiveChanges } from "@/lib/realtime/live-bus";

/**
 * The app-wide live stream.
 *
 * One Server-Sent Events connection per open tab, carrying one kind of event:
 *
 *   `change` -- something in this organization moved; refetch.
 *
 * It says which topic moved (`tasks`, `finance`, ...) but nothing more. The
 * browser refetches through the same server components a page load uses, so
 * what arrives live and what arrives on a refresh come from one code path and
 * cannot disagree.
 *
 * The channel stream (`/api/channels/stream`) is separate: it also carries
 * presence and is scoped to one room. This one is the whole org and has no
 * presence, so it is its own route rather than a mode of that one.
 *
 * Under `/api`, which the middleware matcher excludes, so the session is
 * checked here.
 */

/** A held-open connection is the opposite of a cached response. */
export const dynamic = "force-dynamic";

/**
 * Proxies and browsers hang up on a quiet connection. A comment line every
 * twenty-five seconds keeps it open and costs two bytes.
 */
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request): Promise<Response> {
  const session = await getCurrentUser();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { actor } = session;
  const encoder = new TextEncoder();

  const teardown: Array<() => void> = [];
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  function close(): void {
    if (!open) return;
    open = false;
    while (teardown.length > 0) teardown.pop()?.();
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
          open = false;
        }
      }

      // A first frame right away, so a proxy that buffers until it has seen
      // something flushes the response headers and the client's `onopen` fires.
      send("ready", { at: Date.now() });

      void subscribeLiveChanges(actor.organizationId, (change) => {
        send("change", { topic: change.topic });
      })
        .then((unsubscribe) => {
          if (!open) unsubscribe();
          else teardown.push(unsubscribe);
        })
        .catch((error) => {
          console.error("[realtime] could not subscribe to the live stream", error);
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

    cancel() {
      close();
    },
  });

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
