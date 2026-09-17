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
import { useCallback, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
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
    // the new value even though nothing was actually saved.
  }
  window.dispatchEvent(new Event(eventNameFor(storageKey)));
}

/**
 * Widths keyed by column id rather than array position, so a saved width
 * follows its column through a reorder instead of following whatever slot
 * it used to sit in. Every known id always gets an entry (falling back to
 * `defaultWidth`).
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
 * The coordination queue's columns -- every one of them independently
 * resizable from either edge, and reorderable by dragging a whole column
 * left or right.
 *
 * Each column owns its own width outright. Growing one never shrinks
 * another to make room -- there is no shared budget being fought over,
 * unlike an earlier version of this component that clamped every column to
 * whatever the row's container had left. That made "resize any one of them
 * without the others paying for it" impossible by construction, which is
 * exactly the complaint that replaced it: the row itself now scrolls
 * horizontally when the columns' combined width exceeds what's visible,
 * the same `overflow-x-auto` pattern `table.tsx`'s own wide-table wrapper
 * already uses (`role="region" tabIndex={0}` so a keyboard user can reach
 * and scroll it) -- so it is this row, never the page, that ever grows past
 * its container.
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
 * The stack-below-desktop behaviour is plain CSS (`flex-col lg:flex-row`),
 * not a JS media-query check -- a JS `isDesktop` boolean has to start from
 * *something* on the server, and whatever it starts from is briefly wrong
 * for everyone on the other side of that guess the instant the real client
 * value replaces it after hydration. Reorder and resize controls only
 * render at `lg:` and up: below that the columns are already a single
 * stacked list and neither interaction means anything there.
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
  const orderKey = `${storageKey}-order`;

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
  const widths = liveWidths ?? persistedWidths;

  function resizeBy(id: string, delta: number) {
    const next = { ...persistedWidths };
    next[id] = clampWidth((persistedWidths[id] ?? defaultWidth) + delta, defaultWidth);
    writeStored(storageKey, JSON.stringify(next));
  }

  /** `side` flips which drag direction grows the column: right-edge grows
   *  when dragged right, left-edge grows when dragged left. Both write the
   *  same one number for this column's own id -- nothing else changes. */
  function onResizePointerDown(id: string, side: "left" | "right") {
    return (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = persistedWidths[id] ?? defaultWidth;
      const sign = side === "right" ? 1 : -1;

      function widthAt(clientX: number): number {
        return clampWidth(startWidth + sign * (clientX - startX), defaultWidth);
      }

      function onMove(moveEvent: PointerEvent) {
        setLiveWidths({ ...persistedWidths, [id]: widthAt(moveEvent.clientX) });
      }
      function onUp(upEvent: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setLiveWidths(null);
        const next = { ...persistedWidths, [id]: widthAt(upEvent.clientX) };
        writeStored(storageKey, JSON.stringify(next));
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
        <div
          role="region"
          tabIndex={0}
          aria-label={t("resizableColumnsRegion")}
          className="flex flex-col gap-4 focus-visible:outline-focus-ring rounded-card lg:flex-row lg:items-stretch lg:overflow-x-auto lg:pb-1 lg:focus-visible:outline-2 lg:focus-visible:outline-offset-2"
        >
          {order.map((id) => {
            const title = titleById.get(id) ?? "";
            const width = widths[id] ?? defaultWidth;
            return (
              <QueueColumn
                key={id}
                id={id}
                width={width}
                isFirst={order.indexOf(id) === 0}
                isLastPosition={order.indexOf(id) === order.length - 1}
                onMoveLeft={() => moveColumn(id, -1)}
                onMoveRight={() => moveColumn(id, 1)}
                moveLeftLabel={t("moveColumnLeft")}
                moveRightLabel={t("moveColumnRight")}
                resizeLeftLabel={t("resizeColumnLeft", { title })}
                resizeRightLabel={t("resizeColumnRight", { title })}
                onResizePointerDown={onResizePointerDown}
                onResizeKey={resizeBy}
              >
                {nodeById.get(id)}
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
  width,
  isFirst,
  isLastPosition,
  onMoveLeft,
  onMoveRight,
  moveLeftLabel,
  moveRightLabel,
  resizeLeftLabel,
  resizeRightLabel,
  onResizePointerDown,
  onResizeKey,
  children,
}: {
  id: string;
  width: number;
  isFirst: boolean;
  isLastPosition: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  moveLeftLabel: string;
  moveRightLabel: string;
  resizeLeftLabel: string;
  resizeRightLabel: string;
  onResizePointerDown: (id: string, side: "left" | "right") => (event: React.PointerEvent) => void;
  onResizeKey: (id: string, delta: number) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    "--pane-width": `${width}px`,
  } as React.CSSProperties;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onResizeKey(id, -STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onResizeKey(id, STEP);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative w-full min-w-0",
        "lg:w-[var(--pane-width)] lg:flex-none lg:shrink-0",
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

      {/* Every column carries both of its own edges -- growing this one
          never touches a neighbour's stored width, only where it happens
          to sit once the row lays out again. */}
      <ResizeHandle
        className="-left-1.5 hidden lg:block"
        label={resizeLeftLabel}
        valueNow={width}
        valueMin={MIN_WIDTH}
        valueMax={MAX_WIDTH}
        onPointerDown={onResizePointerDown(id, "left")}
        onKeyDown={handleKeyDown}
      />
      <ResizeHandle
        className="-right-1.5 hidden lg:block"
        label={resizeRightLabel}
        valueNow={width}
        valueMin={MIN_WIDTH}
        valueMax={MAX_WIDTH}
        onPointerDown={onResizePointerDown(id, "right")}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
