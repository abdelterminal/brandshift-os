"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { saveBoardChanges } from "@/lib/actions/tasks";
import { PersonAvatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import {
  BOARD_STATUSES,
  computeBoardDiff,
  groupByStatus,
  hasUnsavedChanges,
  isBoardStatus,
  type BoardColumns,
  type BoardStatus,
} from "@/lib/board";
import type { AssignablePerson, TaskRow } from "@/lib/data/task-types";
import { cn } from "@/lib/utils";

import { STATUS_TONE } from "./task-list";
import { TaskDrawer, type TaskDrawerViewer } from "./task-drawer";

/**
 * The interactive board: drag to move a card, small chevrons to do the same
 * thing without a pointer, nothing written until Save.
 *
 * Everything a drag does, a chevron does too, through the same two functions
 * (`applyMove` / `moveWithinColumn`) -- this is deliberately not dnd-kit's own
 * keyboard sensor. Cross-column movement by keyboard means jumping between
 * separate `SortableContext`s, which dnd-kit does not do out of the box, and
 * reimplementing its own multi-container reference example by hand is a lot
 * of surface for something this app already has a simpler, proven answer to:
 * SOP steps and template tasks reorder with plain Move up/Move down buttons
 * for exactly the same reason -- "a drag has no keyboard equivalent" (see
 * KNOWN-GAPS.md's history on that). Four small, always-visible, always-
 * labelled buttons are a firmer guarantee of "keyboard-only navigable" than a
 * hand-rolled spatial keyboard drag would be, and they do everything the
 * pointer path does, including the blocked-reason prompt.
 */
export function TaskBoard({
  tasks,
  projectId,
  canEditBoard,
  assignablePeople,
  viewer,
}: {
  tasks: TaskRow[];
  projectId: string;
  canEditBoard: boolean;
  /** Passed straight through to the drawer's own reassignment picker. */
  assignablePeople: AssignablePerson[];
  viewer: TaskDrawerViewer;
}) {
  if (!canEditBoard) return <ReadOnlyBoard tasks={tasks} />;
  return <EditableBoard tasks={tasks} projectId={projectId} assignablePeople={assignablePeople} viewer={viewer} />;
}

/** What everyone who is not on the project's team still sees -- unchanged. */
function ReadOnlyBoard({ tasks }: { tasks: TaskRow[] }) {
  const statuses = useTranslations("Status");
  const t = useTranslations("Work");

  const columns = BOARD_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));

  if (tasks.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("noTasks")} description={t("noTasksBody")} />
      </div>
    );
  }

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={t("tasks")}
      className="relative overflow-x-auto pb-2 focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="flex min-w-[48rem] gap-3">
        {columns.map((column) => (
          <div key={column.status} className="bg-surface-sunken min-w-0 flex-1 rounded-card p-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              <h4 className="text-label text-fg-default">{statuses(column.status)}</h4>
              <span className="text-caption text-fg-subtle tabular-nums">
                {column.tasks.length}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {column.tasks.map((task) => (
                <li
                  key={task.id}
                  className="bg-surface-raised border-border rounded-control border p-2.5"
                >
                  <p className="text-body text-fg-default">{task.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusPill tone={STATUS_TONE[task.status]} size="sm">
                      {statuses(task.status)}
                    </StatusPill>
                    {task.assigneeName ? <PersonAvatar name={task.assigneeName} size="xs" /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

type PendingBlocked = { taskId: string; fromStatus: BoardStatus; toIndex: number };

/** The interactive board, for a project's own lead or contributor. */
function EditableBoard({
  tasks,
  projectId,
  assignablePeople,
  viewer,
}: {
  tasks: TaskRow[];
  projectId: string;
  assignablePeople: AssignablePerson[];
  viewer: TaskDrawerViewer;
}) {
  const statuses = useTranslations("Status");
  const t = useTranslations("Work");
  const taskText = useTranslations("Task");
  const common = useTranslations("Common");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  // The arrangement the board opened with -- what "no unsaved changes" means.
  // Not the same as reading `position` straight off each task: that column
  // has had exactly one writer before this feature and several rows can tie
  // on its default, `0` (see computeBoardDiff's own comment). Grouping once,
  // here, is the actual baseline; comparing against raw positions instead
  // shows a phantom pile of changes the moment the board opens.
  const initialColumns = useMemo(() => groupByStatus(tasks), [tasks]);
  const [columns, setColumns] = useState<BoardColumns>(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [pendingBlocked, setPendingBlocked] = useState<PendingBlocked | null>(null);
  // The dragged card's own transform is the one deliberate exception to
  // "opacity and color only" -- it is the gesture, not a decoration on top of
  // it -- but the cosmetic animation dnd-kit plays when a card settles into
  // place afterward is not load-bearing, and reduced motion should not get
  // it. Read lazily (not in an effect -- there is nothing to synchronize
  // with, just a one-time read) so the server-rendered pass, which has no
  // `window`, stays the safe default of "motion allowed" and the client's
  // first real render already has the right answer, no flash of the wrong
  // one. A preference that changes mid-session is not a case worth chasing.
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [blockedReasonDraft, setBlockedReasonDraft] = useState("");
  const [blockedReasonError, setBlockedReasonError] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");

  const dirty = hasUnsavedChanges(initialColumns, columns);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function findContainer(id: string): BoardStatus | undefined {
    if (isBoardStatus(id)) return id;
    for (const status of BOARD_STATUSES) if (columns[status].includes(id)) return status;
    return undefined;
  }

  function applyMove(taskId: string, fromStatus: BoardStatus, toStatus: BoardStatus, toIndex: number) {
    setColumns((prev) => {
      if (fromStatus === toStatus) {
        const fromIndex = prev[fromStatus].indexOf(taskId);
        return { ...prev, [fromStatus]: arrayMove(prev[fromStatus], fromIndex, toIndex) };
      }
      const from = prev[fromStatus].filter((id) => id !== taskId);
      const to = [...prev[toStatus]];
      to.splice(Math.min(toIndex, to.length), 0, taskId);
      return { ...prev, [fromStatus]: from, [toStatus]: to };
    });

    const task = tasksById.get(taskId);
    if (task) {
      const count = (fromStatus === toStatus ? columns[toStatus].length : columns[toStatus].length + 1);
      setAnnouncement(
        t("boardMoved", { title: task.title, status: statuses(toStatus), position: toIndex + 1, count }),
      );
    }
  }

  /** A card entering Blocked from anywhere else needs a reason first -- see reportBlocker(). */
  function requestMove(taskId: string, fromStatus: BoardStatus, toStatus: BoardStatus, toIndex: number) {
    if (toStatus === "blocked" && fromStatus !== "blocked") {
      setPendingBlocked({ taskId, fromStatus, toIndex });
      setBlockedReasonDraft("");
      setBlockedReasonError(false);
      return;
    }
    applyMove(taskId, fromStatus, toStatus, toIndex);
  }

  function moveWithinColumn(taskId: string, status: BoardStatus, direction: -1 | 1) {
    const index = columns[status].indexOf(taskId);
    const target = index + direction;
    if (target < 0 || target >= columns[status].length) return;
    applyMove(taskId, status, status, target);
  }

  function moveToAdjacentColumn(taskId: string, status: BoardStatus, direction: -1 | 1) {
    const order = BOARD_STATUSES;
    const index = order.indexOf(status) + direction;
    if (index < 0 || index >= order.length) return;
    const toStatus = order[index]!;
    requestMove(taskId, status, toStatus, columns[toStatus].length);
  }

  function confirmBlockedMove() {
    const reason = blockedReasonDraft.trim();
    if (reason.length < 3) {
      setBlockedReasonError(true);
      return;
    }
    if (!pendingBlocked) return;
    const { taskId, fromStatus, toIndex } = pendingBlocked;
    applyMove(taskId, fromStatus, "blocked", toIndex);
    setBlockedReasons((prev) => ({ ...prev, [taskId]: reason }));
    setPendingBlocked(null);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    const task = tasksById.get(String(event.active.id));
    if (task) setAnnouncement(t("boardPickedUp", { title: task.title }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = String(active.id);
    const fromStatus = findContainer(taskId);
    if (!fromStatus) return;

    const overId = String(over.id);
    const toStatus = findContainer(overId);
    if (!toStatus) return;

    const overIndex = columns[toStatus].indexOf(overId);
    const toIndex = overIndex >= 0 ? overIndex : columns[toStatus].length;
    const fromIndex = columns[fromStatus].indexOf(taskId);
    if (fromStatus === toStatus && fromIndex === toIndex) return;

    requestMove(taskId, fromStatus, toStatus, toIndex);
  }

  function discard() {
    setColumns(initialColumns);
    setBlockedReasons({});
  }

  function save() {
    const diff = computeBoardDiff(initialColumns, columns).map((change) => ({
      ...change,
      blockedReason: change.status === "blocked" ? blockedReasons[change.taskId] : undefined,
    }));

    startTransition(async () => {
      const result = await saveBoardChanges(projectId, diff);
      if (!result.ok) {
        toast.add({ title: t("boardSaveError"), data: { tone: "attention" } });
        return;
      }
      setBlockedReasons({});
      router.refresh();
    });
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined;
  const openTask = openTaskId ? (tasksById.get(openTaskId) ?? null) : null;

  if (tasks.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("noTasks")} description={t("noTasksBody")} />
      </div>
    );
  }

  return (
    <div className={cn(dirty && "pb-16")}>
      {/* Screen readers hear what a sighted user sees happen to the board;
          nobody watching the cursor needs this printed anywhere. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          role="region"
          tabIndex={0}
          aria-label={t("tasks")}
          className="relative overflow-x-auto pb-2 focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="flex min-w-[48rem] gap-3">
            {BOARD_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                taskIds={columns[status]}
                tasksById={tasksById}
                statusLabel={statuses(status)}
                onOpen={setOpenTaskId}
                onMoveWithinColumn={moveWithinColumn}
                onMoveToAdjacentColumn={moveToAdjacentColumn}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeTask ? (
            <div className="bg-surface-raised border-border rounded-control border p-2.5 shadow-overlay">
              <p className="text-body text-fg-default">{activeTask.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {dirty ? (
        <div
          role="status"
          // `role="status"` takes its accessible name from `aria-label`, not
          // from its own text content -- without one, this and dnd-kit's own
          // (nameless) live region are two indistinguishable status regions.
          aria-label={t("unsavedBoardChanges", {
            count: computeBoardDiff(initialColumns, columns).length,
          })}
          className="border-border bg-surface-overlay fixed right-4 bottom-4 left-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-card border p-3 shadow-overlay sm:right-6 sm:bottom-6 sm:left-auto"
        >
          <span className="text-body text-fg-default" aria-hidden="true">
            {t("unsavedBoardChanges", { count: computeBoardDiff(initialColumns, columns).length })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={discard} disabled={pending}>
              {t("discardChanges")}
            </Button>
            <Button variant="primary" size="sm" loading={pending} onClick={save}>
              {t("saveChanges")}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={pendingBlocked !== null} onOpenChange={(open) => !open && setPendingBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{taskText("reportBlocker")}</DialogTitle>
          </DialogHeader>

          <Field>
            <FieldLabel>{taskText("blocker")}</FieldLabel>
            <Textarea
              required
              autoFocus
              value={blockedReasonDraft}
              onChange={(event) => {
                setBlockedReasonDraft(event.target.value);
                setBlockedReasonError(false);
              }}
              placeholder={taskText("blockerPlaceholder")}
              aria-invalid={blockedReasonError ? true : undefined}
            />
            {blockedReasonError ? (
              <FieldError match>{taskText("blockerReasonRequired")}</FieldError>
            ) : null}
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>{common("cancel")}</DialogClose>
            <Button variant="primary" onClick={confirmBlockedMove}>
              {taskText("reportBlocker")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDrawer
        task={openTask}
        assignablePeople={assignablePeople}
        viewer={viewer}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}

function BoardColumn({
  status,
  taskIds,
  tasksById,
  statusLabel,
  onOpen,
  onMoveWithinColumn,
  onMoveToAdjacentColumn,
}: {
  status: BoardStatus;
  taskIds: string[];
  tasksById: Map<string, TaskRow>;
  statusLabel: string;
  onOpen: (taskId: string) => void;
  onMoveWithinColumn: (taskId: string, status: BoardStatus, direction: -1 | 1) => void;
  onMoveToAdjacentColumn: (taskId: string, status: BoardStatus, direction: -1 | 1) => void;
}) {
  // The column itself is a drop target too, so dropping on empty space below
  // the last card -- or into an empty column -- still counts as a drop here.
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className="bg-surface-sunken min-w-0 flex-1 rounded-card p-2"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <h4 className="text-label text-fg-default">{statusLabel}</h4>
        <span className="text-caption text-fg-subtle tabular-nums">{taskIds.length}</span>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-8 flex-col gap-2">
          {taskIds.map((taskId, index) => {
            const task = tasksById.get(taskId);
            if (!task) return null;
            return (
              <BoardCard
                key={taskId}
                task={task}
                status={status}
                isFirst={index === 0}
                isLast={index === taskIds.length - 1}
                onOpen={onOpen}
                onMoveWithinColumn={onMoveWithinColumn}
                onMoveToAdjacentColumn={onMoveToAdjacentColumn}
              />
            );
          })}
        </ul>
      </SortableContext>
    </div>
  );
}

function BoardCard({
  task,
  status,
  isFirst,
  isLast,
  onOpen,
  onMoveWithinColumn,
  onMoveToAdjacentColumn,
}: {
  task: TaskRow;
  status: BoardStatus;
  isFirst: boolean;
  isLast: boolean;
  onOpen: (taskId: string) => void;
  onMoveWithinColumn: (taskId: string, status: BoardStatus, direction: -1 | 1) => void;
  onMoveToAdjacentColumn: (taskId: string, status: BoardStatus, direction: -1 | 1) => void;
}) {
  const statuses = useTranslations("Status");
  const taskText = useTranslations("Task");
  const ui = useTranslations("Ui");
  const columnIndex = BOARD_STATUSES.indexOf(status);

  const { attributes, listeners, setNodeRef, transform, transition: dndTransition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: dndTransition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-surface-raised border-border rounded-control border p-2.5",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-1.5">
        {/*
          Pointer/touch only -- see the note above EditableBoard. A keyboard
          user has the four chevrons below instead, which is why this is
          pulled out of both the tab order and the accessibility tree rather
          than given a label nothing behind it can act on.
        */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-hidden="true"
          tabIndex={-1}
          className="text-fg-subtle hover:text-fg-default mt-0.5 shrink-0 cursor-grab touch-none rounded-[4px] active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpen(task.id)}
          aria-label={taskText("openTask")}
          className={cn(
            "text-body text-fg-default min-w-0 flex-1 rounded-[4px] text-left hover:underline",
            focusRing,
            transition,
          )}
        >
          {task.title}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {/* The column this card is sitting in right now, not `task.status` --
            that is last-known-from-the-server and does not move until Save,
            so a card staged into Blocked would otherwise still read
            "In progress" while visibly sitting in the Blocked column. */}
        <StatusPill tone={STATUS_TONE[status]} size="sm">
          {statuses(status)}
        </StatusPill>
        {task.assigneeName ? <PersonAvatar name={task.assigneeName} size="xs" /> : null}
      </div>

      <div className="border-border mt-2 flex items-center justify-between gap-1 border-t pt-2">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={columnIndex === 0}
            aria-label={ui("moveLeft")}
            onClick={() => onMoveToAdjacentColumn(task.id, status, -1)}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={columnIndex === BOARD_STATUSES.length - 1}
            aria-label={ui("moveRight")}
            onClick={() => onMoveToAdjacentColumn(task.id, status, 1)}
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isFirst}
            aria-label={ui("moveUp")}
            onClick={() => onMoveWithinColumn(task.id, status, -1)}
          >
            <ChevronUp aria-hidden className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isLast}
            aria-label={ui("moveDown")}
            onClick={() => onMoveWithinColumn(task.id, status, 1)}
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}
