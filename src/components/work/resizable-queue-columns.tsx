"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";

import { ResizeHandle } from "@/components/ui/resize-handle";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 220;
const MAX_WIDTH = 560;
const STEP = 16;

function clampWidth(width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function eventNameFor(storageKey: string): string {
  return `brandshift:resize:${storageKey}`;
}

function readStored(storageKey: string): string {
  try {
    return window.localStorage.getItem(storageKey) ?? "";
  } catch {
    // Private browsing, or a browser that blocks storage. Resizing still
    // works for the rest of this visit, it just starts from the default.
    return "";
  }
}

function writeStored(storageKey: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Same as above -- the event below still fires, so this tab still sees
    // the new width even though nothing was actually saved.
  }
  window.dispatchEvent(new Event(eventNameFor(storageKey)));
}

function parseWidths(raw: string, count: number, defaultWidth: number): number[] {
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(saved) && saved.length === count) {
      return saved.map((width) => clampWidth(Number(width), defaultWidth));
    }
  } catch {
    // A corrupt value just falls through to the default below.
  }
  return Array(count).fill(defaultWidth);
}

/**
 * The coordination queue's columns, resizable by dragging the divider
 * between any two -- clamped between a size still worth reading (220px) and
 * one that would swallow the row (560px).
 *
 * Only the first n-1 columns carry an explicit, draggable width; the last
 * always fills whatever is left, so the row exactly fits its container
 * whatever the others are set to -- the same shape a sidebar or an editor
 * pane uses, rather than every column adjusting when one does.
 *
 * The stack-below-desktop behaviour is plain CSS (`flex-col lg:flex-row`),
 * not a JS media-query check: a JS `isDesktop` boolean has to start from
 * *something* on the server, and whatever it starts from is briefly wrong
 * for everyone on the other side of that guess the instant the real client
 * value replaces it after hydration -- a flash of the wrong layout on
 * every desktop visit, not just a one-off. The dragged width itself is a
 * CSS custom property (`--pane-width`), applied only at `lg:` and up, so
 * the same trade-off does not reappear for the number inside it: nothing
 * about the *value* needs the viewport to be known in JS at all.
 *
 * Widths persist to this browser under `storageKey` -- a personal layout
 * preference, not organization data, so it lives in `localStorage` rather
 * than the database. Read through `useSyncExternalStore` for the same
 * reason `sidebar.tsx`'s own collapsed-sections state does: the persisted
 * value has no server-rendered opinion either, and a `useState` seeded in
 * an effect is exactly the cascading-render shape the `react-hooks` lint
 * rule now catches. A drag itself stays local state (`liveWidths`) for
 * per-pixel feedback without hitting storage on every pointer move, and is
 * only committed -- storage write plus the event that updates every reader
 * of it -- on release.
 */
export function ResizableQueueColumns({
  children,
  storageKey,
  defaultWidth = 280,
}: {
  children: React.ReactNode[];
  storageKey: string;
  defaultWidth?: number;
}) {
  const t = useTranslations("Ui");
  const count = children.length;
  const resizableCount = Math.max(0, count - 1);

  const subscribe = useCallback(
    (notify: () => void) => {
      const eventName = eventNameFor(storageKey);
      window.addEventListener(eventName, notify);
      return () => window.removeEventListener(eventName, notify);
    },
    [storageKey],
  );
  const getSnapshot = useCallback(() => readStored(storageKey), [storageKey]);
  const getServerSnapshot = useCallback(() => "", []);
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const persistedWidths = parseWidths(stored, resizableCount, defaultWidth);

  const [liveWidths, setLiveWidths] = useState<number[] | null>(null);
  const widths = liveWidths ?? persistedWidths;

  const resizeBy = useCallback(
    (index: number, delta: number) => {
      const next = [...persistedWidths];
      next[index] = clampWidth(next[index] + delta, defaultWidth);
      writeStored(storageKey, JSON.stringify(next));
    },
    [persistedWidths, defaultWidth, storageKey],
  );

  const onPointerDown = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = persistedWidths[index];
      let current = [...persistedWidths];
      setLiveWidths(current);

      function onMove(moveEvent: PointerEvent) {
        current = [...current];
        current[index] = clampWidth(startWidth + (moveEvent.clientX - startX), defaultWidth);
        setLiveWidths(current);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setLiveWidths(null);
        writeStored(storageKey, JSON.stringify(current));
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persistedWidths, defaultWidth, storageKey],
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      {children.map((child, index) => {
        const isLast = index === count - 1;
        return (
          <div
            key={index}
            className={cn(
              "relative w-full min-w-0",
              isLast ? "lg:min-w-[220px] lg:flex-1" : "lg:w-[var(--pane-width)] lg:flex-none",
            )}
            style={
              isLast ? undefined : ({ "--pane-width": `${widths[index]}px` } as React.CSSProperties)
            }
          >
            {child}
            {!isLast ? (
              <ResizeHandle
                className="-right-1.5 hidden lg:block"
                label={t("resizeColumn")}
                valueNow={widths[index]}
                valueMin={MIN_WIDTH}
                valueMax={MAX_WIDTH}
                onPointerDown={onPointerDown(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    resizeBy(index, -STEP);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    resizeBy(index, STEP);
                  }
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
