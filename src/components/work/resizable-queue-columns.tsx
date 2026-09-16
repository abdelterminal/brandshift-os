"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ResizeHandle } from "@/components/ui/resize-handle";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 220;
const MAX_WIDTH = 560;
const STEP = 16;
/** Matches the row's own `gap-4`. */
const GAP = 16;

function clampWidth(width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/**
 * The most a single resizable column may be, given what the row actually
 * has to spend: its own container's width, minus the gaps between every
 * column, minus every *other* resizable column's current width, minus the
 * last column's own floor (it is never allowed to shrink further than that
 * `min-width` already gives it). Recomputed from the other columns' widths
 * on every call, so growing one column always comes out of the row's own
 * slack rather than the row growing past its container -- which is what
 * forced the whole page to scroll sideways before this.
 */
function maxWidthFor(index: number, widths: number[], containerWidth: number, count: number): number {
  if (containerWidth <= 0) return MAX_WIDTH;
  const gaps = count > 1 ? (count - 1) * GAP : 0;
  const othersTotal = widths.reduce((sum, width, i) => (i === index ? sum : sum + width), 0);
  const available = containerWidth - gaps - MIN_WIDTH - othersTotal;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, available));
}

/**
 * Widths as they should actually render, given the row's real, current
 * width -- a safety net for the case the render-time clamp above doesn't
 * cover: widths saved on a wider screen, now being read back on a narrower
 * one. Scales every column's excess above its own floor by the same factor
 * so the row fits exactly, rather than letting the sum run past the
 * container the moment the window (or the sidebar) makes it narrower than
 * it was when those widths were saved.
 */
function fitWidths(desired: number[], containerWidth: number, count: number): number[] {
  if (containerWidth <= 0 || desired.length === 0) return desired;
  const gaps = count > 1 ? (count - 1) * GAP : 0;
  const budget = containerWidth - gaps - MIN_WIDTH;
  const total = desired.reduce((sum, width) => sum + width, 0);
  if (budget <= 0) return desired.map(() => MIN_WIDTH);
  if (total <= budget) return desired;
  const floor = desired.length * MIN_WIDTH;
  if (budget <= floor) return desired.map(() => MIN_WIDTH);
  const scale = (budget - floor) / (total - floor);
  return desired.map((width) => Math.round(MIN_WIDTH + (width - MIN_WIDTH) * scale));
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  // The safety net: even a persisted width saved on a wider screen (or a
  // wider sidebar state) is fitted to what the row actually has *now*
  // before it ever reaches a style attribute, so reading old widths back on
  // a narrower row can't reopen the overflow this whole thing exists to
  // prevent.
  const widths = fitWidths(liveWidths ?? persistedWidths, containerWidth, count);

  const resizeBy = useCallback(
    (index: number, delta: number) => {
      const next = [...persistedWidths];
      const max = maxWidthFor(index, next, containerWidth, count);
      next[index] = Math.min(max, clampWidth(next[index] + delta, defaultWidth));
      writeStored(storageKey, JSON.stringify(next));
    },
    [persistedWidths, defaultWidth, storageKey, containerWidth, count],
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
        const max = maxWidthFor(index, current, containerWidth, count);
        current[index] = Math.min(max, clampWidth(startWidth + (moveEvent.clientX - startX), defaultWidth));
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
    [persistedWidths, defaultWidth, storageKey, containerWidth, count],
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      {children.map((child, index) => {
        const isLast = index === count - 1;
        return (
          <div
            key={index}
            className={cn(
              "relative w-full min-w-0",
              // No `min-w` floor here, on purpose: the fixed panes are
              // already kept within the row's real width by `fitWidths`/
              // `maxWidthFor` above, but that JS budget is a soft target,
              // not a guarantee against every possible combination (a very
              // narrow `lg:` window, a wide sidebar, browser zoom). `flex-1`
              // with no floor is what makes the CSS itself incapable of
              // ever forcing the row past its container -- this column
              // absorbs whatever's actually left, all the way to 0 in the
              // extreme case, rather than the row overflowing instead.
              isLast ? "lg:flex-1" : "lg:w-[var(--pane-width)] lg:flex-none",
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
