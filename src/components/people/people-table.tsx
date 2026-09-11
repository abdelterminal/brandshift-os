"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";

import type { Role } from "@/db/schema/people";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, CountBadge } from "@/components/ui/badge";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PeopleTableRow = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  jobTitle: string | null;
  departmentName: string | null;
  status: "invited" | "active" | "suspended";
  linkable: boolean;
  openTasks: number;
  overdueTasks: number;
};

type ColumnId = "name" | "role" | "department" | "jobTitle" | "workload";

const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  name: 280,
  role: 130,
  department: 170,
  jobTitle: 200,
  workload: 150,
};

const MIN_WIDTH = 90;
const MAX_WIDTH = 480;
const STEP = 12;
const STORAGE_KEY = "people-table-columns";
const RESIZE_EVENT = "brandshift:people-table-resize";

function clampWidth(width: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function subscribeWidths(notify: () => void) {
  window.addEventListener(RESIZE_EVENT, notify);
  return () => window.removeEventListener(RESIZE_EVENT, notify);
}

function readStoredWidths(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Private browsing, or a browser that blocks storage. Resizing still
    // works for the rest of this visit, it just starts from the defaults.
    return "";
  }
}

function getServerWidths(): string {
  return "";
}

function writeStoredWidths(next: Record<ColumnId, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Same as above -- the event below still fires, so this tab still sees
    // the new width even though nothing was actually saved.
  }
  window.dispatchEvent(new Event(RESIZE_EVENT));
}

function parseWidths(raw: string, ids: ColumnId[]): Record<ColumnId, number> {
  const widths = { ...DEFAULT_WIDTHS };
  try {
    const saved = raw ? (JSON.parse(raw) as Partial<Record<ColumnId, number>>) : null;
    if (saved) {
      for (const id of ids) {
        const value = saved[id];
        if (typeof value === "number") widths[id] = clampWidth(value, DEFAULT_WIDTHS[id]);
      }
    }
  } catch {
    // A corrupt value just keeps the defaults.
  }
  return widths;
}

/**
 * Per-column widths, draggable at the right edge of each header, clamped
 * between 90px (still enough for a badge) and 480px (a column should never
 * swallow the table). A personal layout preference, so it lives in this
 * browser's `localStorage` rather than the database -- read through
 * `useSyncExternalStore`, since the server has no opinion on it either (see
 * `ResizableQueueColumns`'s identical note on the same trade-off). A drag in
 * progress stays local state for per-pixel feedback, and only commits --
 * storage write plus the event every reader listens for -- on release.
 */
function useColumnWidths(ids: ColumnId[]) {
  const stored = useSyncExternalStore(subscribeWidths, readStoredWidths, getServerWidths);
  const persistedWidths = parseWidths(stored, ids);

  const [liveWidths, setLiveWidths] = useState<Record<ColumnId, number> | null>(null);
  const [draggingId, setDraggingId] = useState<ColumnId | null>(null);
  const widths = liveWidths ?? persistedWidths;

  const resizeBy = useCallback(
    (id: ColumnId, delta: number) => {
      const next = {
        ...persistedWidths,
        [id]: clampWidth(persistedWidths[id] + delta, DEFAULT_WIDTHS[id]),
      };
      writeStoredWidths(next);
    },
    [persistedWidths],
  );

  const onPointerDown = useCallback(
    (id: ColumnId) => (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = persistedWidths[id];
      let current = { ...persistedWidths };
      setDraggingId(id);
      setLiveWidths(current);

      function onMove(moveEvent: PointerEvent) {
        current = {
          ...current,
          [id]: clampWidth(startWidth + (moveEvent.clientX - startX), DEFAULT_WIDTHS[id]),
        };
        setLiveWidths(current);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDraggingId(null);
        setLiveWidths(null);
        writeStoredWidths(current);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persistedWidths],
  );

  return { widths, draggingId, onPointerDown, resizeBy };
}

/**
 * The directory's desktop table -- a Client Component on its own so the
 * column widths (dragged, persisted, read back) can live here without
 * turning the whole page client-side. `table-fixed` is what makes a dragged
 * width stick: the default `auto` layout keeps re-measuring content and
 * would fight every resize.
 *
 * The last visible column never gets a fixed width or a handle -- it absorbs
 * whatever the others do not use, the same "last pane is the flexible one"
 * shape `ResizableQueueColumns` uses on Today, so the row keeps meeting the
 * table's own right edge instead of leaving a gap or overflowing it.
 */
export function PeopleTable({
  rows,
  showDepartment,
  isCoordinator,
}: {
  rows: PeopleTableRow[];
  showDepartment: boolean;
  isCoordinator: boolean;
}) {
  const t = useTranslations("People");
  const roles = useTranslations("Roles");
  const ui = useTranslations("Ui");

  const columns: { id: ColumnId; label: string; hiddenClass?: string }[] = [
    { id: "name", label: t("name") },
    { id: "role", label: t("role"), hiddenClass: "hidden sm:table-cell" },
    ...(showDepartment
      ? [{ id: "department" as const, label: t("department"), hiddenClass: "hidden md:table-cell" }]
      : []),
    { id: "jobTitle", label: t("jobTitle"), hiddenClass: "hidden lg:table-cell" },
    ...(isCoordinator ? [{ id: "workload" as const, label: t("workload") }] : []),
  ];

  const { widths, draggingId, onPointerDown, resizeBy } = useColumnWidths(
    columns.map((column) => column.id),
  );

  return (
    <TableContainer className="mt-4 hidden md:block">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => {
              const isLast = index === columns.length - 1;
              return (
                <TableHead
                  key={column.id}
                  className={cn("relative", column.hiddenClass)}
                  style={isLast ? undefined : { width: widths[column.id] }}
                >
                  {column.label}
                  {!isLast ? (
                    <ResizeHandle
                      className="-right-1.5"
                      dragging={draggingId === column.id}
                      label={ui("resizeColumn")}
                      valueNow={widths[column.id]}
                      valueMin={MIN_WIDTH}
                      valueMax={MAX_WIDTH}
                      onPointerDown={onPointerDown(column.id)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          resizeBy(column.id, -STEP);
                        } else if (event.key === "ArrowRight") {
                          event.preventDefault();
                          resizeBy(column.id, STEP);
                        }
                      }}
                    />
                  ) : null}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((person) => (
            <TableRow key={person.userId}>
              <TableCell>
                <span className="flex items-center gap-2.5">
                  <PersonAvatar
                    name={person.name}
                    src={person.avatarUrl}
                    size="sm"
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    {person.linkable ? (
                      <Link
                        href={`/people/${person.userId}`}
                        className="text-fg-default focus-visible:outline-focus-ring block truncate rounded-[4px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {person.name}
                      </Link>
                    ) : (
                      <span className="text-fg-default block truncate font-medium">
                        {person.name}
                      </span>
                    )}
                    <span className="text-caption text-fg-subtle block truncate">
                      {person.email}
                    </span>
                  </span>
                  {person.status === "invited" ? (
                    <Badge tone="attention" size="sm" className="shrink-0">
                      {t("pending")}
                    </Badge>
                  ) : null}
                </span>
              </TableCell>

              <TableCell className="hidden sm:table-cell">
                <Badge tone={person.role === "owner" ? "accent" : "neutral"} size="sm">
                  {roles(person.role)}
                </Badge>
              </TableCell>

              {showDepartment ? (
                <TableCell className="text-fg-muted hidden truncate md:table-cell">
                  {person.departmentName ?? "--"}
                </TableCell>
              ) : null}

              <TableCell className="text-fg-muted hidden truncate lg:table-cell">
                {person.jobTitle ?? "--"}
              </TableCell>

              {isCoordinator ? (
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="text-fg-muted tabular-nums">{person.openTasks}</span>
                    {person.overdueTasks > 0 ? (
                      <CountBadge tone="attention">{person.overdueTasks}</CountBadge>
                    ) : null}
                  </span>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
