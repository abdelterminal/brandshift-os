import type { TaskRow } from "./data/task-types";

/**
 * The task board's own arithmetic: where a card sits, what actually changed,
 * and what a status change means for the fields around it.
 *
 * Kept apart from the drag library and the server action deliberately -- this
 * is the part worth being exactly right, and it is easiest to get right, and
 * to prove right, with no DOM and no network in the way.
 */

/** The four columns a card can actually be dragged into. `cancelled` has no column. */
export const BOARD_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export function isBoardStatus(value: string): value is BoardStatus {
  return (BOARD_STATUSES as readonly string[]).includes(value);
}

/** One column's cards, in board order -- just the ids, not the whole row. */
export type BoardColumns = Record<BoardStatus, string[]>;

/**
 * Split a project's tasks into columns, ordered by `position`.
 *
 * `position` has had exactly one writer until now -- a project created from
 * the wizard sets it 0..n-1 across that project's first tasks -- so a task
 * added afterwards through the ordinary "add task" action still carries the
 * column default, `0`. Untouched, several cards can tie on the same number;
 * `Array.prototype.sort` is stable, so a tie keeps whatever order the rows
 * arrived in rather than jumping around on every render, and the first Save
 * from this board renumbers the column and the tie is gone for good.
 */
export function groupByStatus(tasks: TaskRow[]): BoardColumns {
  const columns: BoardColumns = { todo: [], in_progress: [], blocked: [], done: [] };
  for (const status of BOARD_STATUSES) {
    columns[status] = tasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.position - b.position)
      .map((task) => task.id);
  }
  return columns;
}

export type BoardChange = {
  taskId: string;
  status: BoardStatus;
  position: number;
  /**
   * Only set by the caller for a genuine move *into* `blocked` from something
   * else -- collected interactively at the moment of that move, in
   * task-board.tsx. `computeBoardDiff` never adds one on its own: a card that
   * was already blocked and only got reordered keeps its existing reason
   * untouched, which is what `statusFieldsFor` does when old and new status
   * are the same.
   */
  blockedReason?: string;
};

/**
 * What actually needs writing.
 *
 * Compared column by column against the arrangement the board first rendered
 * -- `initialColumns`, `groupByStatus(tasks)` captured once at mount -- not
 * against the raw `position` integers each task's row happens to hold today.
 * Those two are not the same thing: `position` has had exactly one writer
 * before this feature (a project created from the wizard, 0..n-1 across its
 * first tasks), so any task added the ordinary way still carries the column
 * default, `0`, and a column can hold several of those ties. Diffing against
 * raw positions read every one of those ties as "moved" the instant the
 * board opened, before anyone touched anything -- which is exactly backwards
 * for a screen whose entire premise is "nothing is written until you ask".
 *
 * A column identical to its initial order writes nothing at all. A column
 * that differs -- in order, or in membership -- has every one of its cards
 * renumbered 0..n-1 and written, not just the one that was dragged: moving
 * one card shifts the implied position of everything after it, including
 * cards nobody touched.
 */
export function computeBoardDiff(initialColumns: BoardColumns, columns: BoardColumns): BoardChange[] {
  const changes: BoardChange[] = [];

  for (const status of BOARD_STATUSES) {
    const before = initialColumns[status];
    const after = columns[status];
    const unchanged = before.length === after.length && before.every((id, i) => id === after[i]);
    if (unchanged) continue;

    after.forEach((taskId, position) => changes.push({ taskId, status, position }));
  }

  return changes;
}

/** Whether the board has anything worth a Save button. */
export function hasUnsavedChanges(initialColumns: BoardColumns, columns: BoardColumns): boolean {
  return computeBoardDiff(initialColumns, columns).length > 0;
}

/**
 * The field patch one status change carries, mirroring the single-task
 * actions in `src/lib/actions/tasks.ts` exactly -- `startTask`, `completeTask`,
 * `reportBlocker`, `clearBlocker` -- so a change made by dragging a card and
 * the same change made from the task drawer leave the row in an identical
 * state. A `reason` is required only when the target is `blocked`, which the
 * caller collects before this is ever called; every other target ignores it.
 */
export type StatusFieldPatch = {
  status: BoardStatus;
  startedAt: Date | null | undefined;
  completedAt: Date | null | undefined;
  blockedAt: Date | null | undefined;
  blockedReason: string | null | undefined;
  /** Which existing activity verb this matches, if any -- see tasks.ts. `null` when
   *  the transition has never had a name in this app (see the `todo` case below). */
  activityVerb: "task.started" | "task.completed" | "task.blocked" | "task.unblocked" | null;
};

export function statusFieldsFor(
  oldStatus: BoardStatus,
  newStatus: BoardStatus,
  now: Date,
  blockedReason?: string,
): StatusFieldPatch {
  if (oldStatus === newStatus) {
    // A pure reorder: nothing about the task's own state changed, so nothing
    // here should be touched -- `undefined` fields are left out of the write.
    return {
      status: newStatus,
      startedAt: undefined,
      completedAt: undefined,
      blockedAt: undefined,
      blockedReason: undefined,
      activityVerb: null,
    };
  }

  switch (newStatus) {
    case "in_progress":
      return {
        status: "in_progress",
        startedAt: now,
        completedAt: null,
        blockedAt: null,
        blockedReason: null,
        activityVerb: "task.started",
      };
    case "done":
      return {
        status: "done",
        startedAt: undefined,
        completedAt: now,
        blockedAt: null,
        blockedReason: null,
        activityVerb: "task.completed",
      };
    case "blocked":
      return {
        status: "blocked",
        startedAt: undefined,
        completedAt: undefined,
        blockedAt: now,
        blockedReason: blockedReason ?? null,
        activityVerb: "task.blocked",
      };
    case "todo":
      // Clearing a blocker is a named action (`clearBlocker`) and gets its
      // verb; landing on `todo` from anywhere else -- undoing a start, undoing
      // a completion -- has never had one in this app, so none is invented
      // here. The fields still reset: `todo` means none of the others apply.
      return {
        status: "todo",
        startedAt: null,
        completedAt: null,
        blockedAt: null,
        blockedReason: null,
        activityVerb: oldStatus === "blocked" ? "task.unblocked" : null,
      };
  }
}
