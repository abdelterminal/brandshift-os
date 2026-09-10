"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { withBasePath } from "@/lib/base-path";

/**
 * Keeps the page current with everyone else's changes.
 *
 * Mounted once in the app shell. It holds one Server-Sent Events connection to
 * `/api/stream` and, whenever the server says something in this organization
 * moved, calls `router.refresh()` -- which re-runs the current route's server
 * components and reconciles the result in place. Scroll position, form state,
 * and open drawers are kept; only the data that changed re-renders.
 *
 * Four refinements keep it from being a nuisance:
 *
 *  - **Debounced.** A burst of changes (someone dragging a board, a batch
 *    import) collapses into one refetch a beat later, not one per event.
 *  - **Never on top of your own action.** A refresh is held back until things
 *    have been quiet for a moment after your last click or keypress, so it
 *    reconciles the *result* of a mutation you just made rather than racing
 *    the request that makes it.
 *  - **Only when you're looking.** A background tab does not refetch; it
 *    remembers that it fell behind and catches up the moment it is focused.
 *  - **Reconnect catches up.** If the connection drops and comes back, one
 *    refresh covers whatever was missed while it was down.
 */

const DEBOUNCE_MS = 500;
/** How long after a click or keypress a live refresh waits before it fires. */
const QUIET_MS = 1200;

export function LiveSync() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missedWhileHidden = false;
    let everOpened = false;
    let closed = false;
    let lastInteraction = 0;

    function refreshNow() {
      missedWhileHidden = false;
      router.refresh();
    }

    function scheduleRefresh() {
      if (timer) clearTimeout(timer);
      const wait = Math.max(DEBOUNCE_MS, QUIET_MS - (Date.now() - lastInteraction));
      timer = setTimeout(() => {
        timer = undefined;
        if (closed) return;
        // Someone is still mid-action -- let their request land first.
        if (Date.now() - lastInteraction < QUIET_MS) {
          scheduleRefresh();
          return;
        }
        if (document.visibilityState === "visible") {
          refreshNow();
        } else {
          // Catch up on focus rather than refetching a page nobody is reading.
          missedWhileHidden = true;
        }
      }, wait);
    }

    function markInteraction() {
      lastInteraction = Date.now();
    }
    document.addEventListener("pointerdown", markInteraction, true);
    document.addEventListener("keydown", markInteraction, true);

    const source = new EventSource(withBasePath("/api/stream"));

    source.addEventListener("change", scheduleRefresh);

    source.addEventListener("open", () => {
      // The first open is just the connection coming up. A later one is a
      // reconnect, and the gap may have hidden changes.
      if (everOpened) scheduleRefresh();
      everOpened = true;
    });

    // EventSource retries on its own; nothing to do here but not treat the
    // transient error as fatal.
    source.addEventListener("error", () => {});

    function onVisibility() {
      if (document.visibilityState === "visible" && missedWhileHidden) refreshNow();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("pointerdown", markInteraction, true);
      document.removeEventListener("keydown", markInteraction, true);
      document.removeEventListener("visibilitychange", onVisibility);
      source.close();
    };
  }, [router]);

  return null;
}
