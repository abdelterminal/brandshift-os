"use client";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
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
    // the new value even though nothing was actually saved.
  }
  window.dispatchEvent(new Event(eventNameFor(storageKey)));
}

/**
 * Widths keyed by column id rather than array position, so a saved width
 * follows its column through a reorder instead of following whatever slot
 * it used to sit in. Every known id always gets an entry (falling back to
 * `defaultWidth`) regardless of whether that column is *currently* the
 * flex-filled last one -- it may not stay last after the next reorder.
 */
function parseWidths(raw: string, ids: string[], defaultWidth: number): Record<string, number> {
  let saved: unknown = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    // A corrupt value just falls through to the default below.
  }
  const obj = saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const result: Record<string, number> = {};
  for (const id of ids) {
    const value = obj[id];
    result[id] = value === undefined || value === null ? defaultWidth : clampWidth(Number(value), defaultWidth);
  }
  return result;
}

function parseOrder(raw: string): string[] {
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) {
      return saved as string[];
    }
  } catch {
    // Falls through to an empty order below.
  }
  return [];
}

/**
 * The order to actually render: whatever was saved, minus any id that no
 * longer exists, plus any id that's new and wasn't in the saved order yet --
 * appended, never dropped. A column a manager has never seen before must
 * still show up even though the browser has an opinion about every column
 * it *has* seen.
 */
function reconcileOrder(storedOrder: string[], ids: string[]): string[] {
  const known = new Set(ids);
  const kept = storedOrder.filter((id) => known.has(id));
  const missing = ids.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

/**
 * The coordination queue's columns -- resizable by dragging the divider
 * between any two (clamped between a size still worth reading, 220px, and
 * one that would swallow the row, 560px), and reorderable by dragging a
 * whole column left or right.
 *
 * Reorder follows the same pattern already used twice elsewhere in this app
 * -- `task-board.tsx`'s project Kanban and `pipeline-board.tsx`'s stage
 * board -- rather than inventing a third way to drag something in this
 * codebase: a pointer-only grip handle pulled out of the accessibility tree
 * (`aria-hidden`, `tabIndex={-1}`) paired with Left/Right buttons that call
 * the exact same `moveColumn` the drag path does. dnd-kit's own keyboard
 * sensor is deliberately not wired up here either -- moot regardless, since
 * the grip is unreachable by Tab, same reasoning `task-board.tsx`'s own doc
 * comment gives for why four visible buttons beat a hand-rolled spatial
 * keyboard drag.
 *
 * Only the first n-1 columns (in whatever the *current* order is) carry an
 * explicit, draggable width; the last always fills whatever is left, so the
 * row exactly fits its container whatever the others are set to -- and
 * because that check is purely positional (`index === count - 1`), it keeps
 * working correctly after a reorder with no extra logic: "last" just means
 * whichever column the order currently ends with.
 *
 * The stack-below-desktop behaviour is plain CSS (`flex-col lg:flex-row`),
 * not a JS media-query check -- see the original version of this comment,
 * unchanged reasoning. Reorder controls only render at `lg:` and up, same
 * as the resize handle, for the same reason: below that the columns are
 * already a single stacked list and neither interaction means anything
 * there.
 *
 * Order and widths persist to this browser under `storageKey` (widths) and
 * `` `${storageKey}-order` `` (order) -- a personal layout preference, not
 * organization data, so both live in `localStorage` rather than the
 * database, read through `useSyncExternalStore` for the same reason
 * `sidebar.tsx`'s own collapsed-sections state does.
 */
export function ResizableQueueColumns({
  children,
  storageKey,
  defaultWidth = 280,
}: {
  children: { id: string; title: string; node: React.ReactNode }[];
  storageKey: string;
  defaultWidth?: number;
}) {
  const t = useTranslations("Ui");
  const ids = children.map((c) => c.id);
  const titleById = new Map(children.map((c) => [c.id, c.title]));
  const nodeById = new Map(children.map((c) => [c.id, c.node]));
  const count = ids.length;
  const orderKey = `${storageKey}-order`;

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

  const getServerSnapshot = useCallback(() => "", []);

  const widthsSubscribe = useCallback(
    (notify: () => void) => {
      const eventName = eventNameFor(storageKey);
      window.addEventListener(eventName, notify);
      return () => window.removeEventListener(eventName, notify);
    },
    [storageKey],
  );
  const widthsSnapshot = useCallback(() => readStored(storageKey), [storageKey]);
  const storedWidthsRaw = useSyncExternalStore(widthsSubscribe, widthsSnapshot, getServerSnapshot);
  const persistedWidths = parseWidths(storedWidthsRaw, ids, defaultWidth);

  const orderSubscribe = useCallback(
    (notify: () => void) => {
      const eventName = eventNameFor(orderKey);
      window.addEventListener(eventName, notify);
      return () => window.removeEventListener(eventName, notify);
    },
    [orderKey],
  );
  const orderSnapshot = useCallback(() => readStored(orderKey), [orderKey]);
  const storedOrderRaw = useSyncExternalStore(orderSubscribe, orderSnapshot, getServerSnapshot);
  const persistedOrder = reconcileOrder(parseOrder(storedOrderRaw), ids);

  const [liveWidths, setLiveWidths] = useState<Record<string, number> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const order = persistedOrder;
  const resizableIds = order.slice(0, -1);
  const widthSource = liveWidths ?? persistedWidths;
  // The safety net: even a width saved on a wider screen (or a wider sidebar
  // state) is fitted to what the row actually has *now* before it ever
  // reaches a style attribute, so reading old widths back on a narrower row
  // can't reopen the overflow this whole thing exists to prevent.
  const fittedWidths = fitWidths(
    resizableIds.map((id) => widthSource[id] ?? defaultWidth),
    containerWidth,
    count,
  );
  const widthById = new Map(resizableIds.map((id, i) => [id, fittedWidths[i]]));

  function widthsRecordFrom(arr: number[]): Record<string, number> {
    const rec = { ...persistedWidths };
    resizableIds.forEach((id, i) => {
      rec[id] = arr[i];
    });
    return rec;
  }

  function resizeBy(index: number, delta: number) {
    const arr = resizableIds.map((id) => persistedWidths[id] ?? defaultWidth);
    const max = maxWidthFor(index, arr, containerWidth, count);
    arr[index] = Math.min(max, clampWidth(arr[index] + delta, defaultWidth));
    writeStored(storageKey, JSON.stringify(widthsRecordFrom(arr)));
  }

  function onResizePointerDown(index: number) {
    return (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startArr = resizableIds.map((id) => persistedWidths[id] ?? defaultWidth);
      const startWidth = startArr[index];
      let current = [...startArr];
      setLiveWidths(widthsRecordFrom(current));

      function onMove(moveEvent: PointerEvent) {
        current = [...current];
        const max = maxWidthFor(index, current, containerWidth, count);
        current[index] = Math.min(max, clampWidth(startWidth + (moveEvent.clientX - startX), defaultWidth));
        setLiveWidths(widthsRecordFrom(current));
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setLiveWidths(null);
        writeStored(storageKey, JSON.stringify(widthsRecordFrom(current)));
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  function moveColumn(id: string, direction: -1 | 1) {
    const from = persistedOrder.indexOf(id);
    if (from === -1) return;
    const to = from + direction;
    if (to < 0 || to >= persistedOrder.length) return;
    const next = arrayMove(persistedOrder, from, to);
    writeStored(orderKey, JSON.stringify(next));
    setAnnouncement(
      t("columnMoved", { title: titleById.get(id) ?? "", position: to + 1, count: persistedOrder.length }),
    );
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function onDragStart(event: DragStartEvent) {
    const title = titleById.get(String(event.active.id)) ?? "";
    setAnnouncement(t("columnPickedUp", { title }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = persistedOrder.indexOf(String(active.id));
    const to = persistedOrder.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(persistedOrder, from, to);
    writeStored(orderKey, JSON.stringify(next));
    setAnnouncement(
      t("columnMoved", { title: titleById.get(String(active.id)) ?? "", position: to + 1, count: next.length }),
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <SortableContext items={order} strategy={horizontalListSortingStrategy}>
        <div ref={containerRef} className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          {order.map((id, index) => {
            const isLast = index === count - 1;
            return (
              <QueueColumn
                key={id}
                id={id}
                isLast={isLast}
                width={isLast ? undefined : widthById.get(id)}
                isFirst={index === 0}
                isLastPosition={index === count - 1}
                onMoveLeft={() => moveColumn(id, -1)}
                onMoveRight={() => moveColumn(id, 1)}
                moveLeftLabel={t("moveColumnLeft")}
                moveRightLabel={t("moveColumnRight")}
              >
                {nodeById.get(id)}
                {!isLast ? (
                  <ResizeHandle
                    className="-right-1.5 hidden lg:block"
                    label={t("resizeColumn")}
                    valueNow={widthById.get(id) ?? defaultWidth}
                    valueMin={MIN_WIDTH}
                    valueMax={MAX_WIDTH}
                    onPointerDown={onResizePointerDown(index)}
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
              </QueueColumn>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function QueueColumn({
  id,
  isLast,
  width,
  isFirst,
  isLastPosition,
  onMoveLeft,
  onMoveRight,
  moveLeftLabel,
  moveRightLabel,
  children,
}: {
  id: string;
  isLast: boolean;
  width: number | undefined;
  isFirst: boolean;
  isLastPosition: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  moveLeftLabel: string;
  moveRightLabel: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isLast ? {} : ({ "--pane-width": `${width}px` } as React.CSSProperties)),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative w-full min-w-0",
        // No `min-w` floor here, on purpose: the fixed panes are already
        // kept within the row's real width by `fitWidths`/`maxWidthFor`
        // above, but that JS budget is a soft target, not a guarantee
        // against every possible combination (a very narrow `lg:` window, a
        // wide sidebar, browser zoom). `flex-1` with no floor is what makes
        // the CSS itself incapable of ever forcing the row past its
        // container -- this column absorbs whatever's actually left, all
        // the way to 0 in the extreme case, rather than the row overflowing
        // instead.
        isLast ? "lg:flex-1" : "lg:w-[var(--pane-width)] lg:flex-none",
        isDragging && "opacity-50",
      )}
    >
      <div className="mb-1.5 hidden items-center justify-between gap-1 lg:flex">
        {/*
          Pointer/touch only -- the two chevrons beside it are the real
          keyboard path, same split `task-board.tsx` and `pipeline-board.tsx`
          already use for their own drag handles.
        */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-hidden="true"
          tabIndex={-1}
          className="text-fg-subtle hover:text-fg-default cursor-grab touch-none rounded-[4px] active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={isFirst} aria-label={moveLeftLabel} onClick={onMoveLeft}>
            <ChevronLeft aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isLastPosition}
            aria-label={moveRightLabel}
            onClick={onMoveRight}
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
