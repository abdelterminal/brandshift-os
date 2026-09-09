import { describe, expect, it } from "vitest";

import {
  computeBoardDiff,
  groupByStatus,
  hasUnsavedChanges,
  isBoardStatus,
  statusFieldsFor,
  type BoardColumns,
} from "./board";
import type { TaskRow } from "./data/task-types";

/**
 * The board's own arithmetic: grouping, diffing, and what a status change
 * does to the fields around it. No DOM, no drag library, no network -- just
 * the part a wrong answer would be expensive in.
 */

function task(overrides: Partial<TaskRow> & { id: string; status: TaskRow["status"] }): TaskRow {
  return {
    title: "A task",
    description: null,
    priority: "medium",
    dueDate: null,
    blockedReason: null,
    estimateHours: null,
    assigneeUserId: null,
    assigneeName: null,
    projectId: "proj-1",
    projectKey: "ABC",
    projectName: "A project",
    position: 0,
    ...overrides,
  };
}

describe("isBoardStatus", () => {
  it("accepts the four board columns and refuses cancelled", () => {
    expect(isBoardStatus("todo")).toBe(true);
    expect(isBoardStatus("in_progress")).toBe(true);
    expect(isBoardStatus("blocked")).toBe(true);
    expect(isBoardStatus("done")).toBe(true);
    // Cancelled has no column on the board -- see KNOWN-GAPS.md.
    expect(isBoardStatus("cancelled")).toBe(false);
    expect(isBoardStatus("not-a-status")).toBe(false);
  });
});

describe("groupByStatus", () => {
  it("sorts each column by position", () => {
    const tasks = [
      task({ id: "a", status: "todo", position: 2 }),
      task({ id: "b", status: "todo", position: 0 }),
      task({ id: "c", status: "todo", position: 1 }),
    ];

    expect(groupByStatus(tasks).todo).toEqual(["b", "c", "a"]);
  });

  it("keeps arrival order for a tie, rather than reshuffling on every render", () => {
    // What createTask() leaves behind: every manually added task defaults to
    // position 0, so several can tie.
    const tasks = [
      task({ id: "a", status: "todo", position: 0 }),
      task({ id: "b", status: "todo", position: 0 }),
      task({ id: "c", status: "todo", position: 0 }),
    ];

    expect(groupByStatus(tasks).todo).toEqual(["a", "b", "c"]);
  });

  it("splits into all four columns and ignores cancelled", () => {
    const tasks = [
      task({ id: "a", status: "todo" }),
      task({ id: "b", status: "in_progress" }),
      task({ id: "c", status: "blocked" }),
      task({ id: "d", status: "done" }),
      task({ id: "e", status: "cancelled" }),
    ];

    const columns = groupByStatus(tasks);
    expect(columns.todo).toEqual(["a"]);
    expect(columns.in_progress).toEqual(["b"]);
    expect(columns.blocked).toEqual(["c"]);
    expect(columns.done).toEqual(["d"]);
  });
});

describe("computeBoardDiff", () => {
  // The arrangement the board would have opened with -- not raw `position`
  // integers, which is exactly the bug this function exists to avoid. Real
  // data ties on position 0 constantly (see groupByStatus's own test above);
  // comparing against that directly would read every one of those ties as
  // "moved" before anyone touched the board.
  const initialColumns: BoardColumns = {
    todo: ["a", "b"],
    in_progress: ["c"],
    blocked: [],
    done: [],
  };

  it("is empty when nothing moved", () => {
    expect(computeBoardDiff(initialColumns, initialColumns)).toEqual([]);
    expect(hasUnsavedChanges(initialColumns, initialColumns)).toBe(false);
  });

  it("is empty for a fresh equal copy, not just the same reference", () => {
    // groupByStatus() is called again on mount in the real component; the
    // comparison has to be by content, not by object identity.
    const copy: BoardColumns = { todo: ["a", "b"], in_progress: ["c"], blocked: [], done: [] };
    expect(computeBoardDiff(initialColumns, copy)).toEqual([]);
  });

  it("reports a task moved to another column", () => {
    const columns: BoardColumns = {
      todo: ["b"],
      in_progress: ["c", "a"],
      blocked: [],
      done: [],
    };

    const diff = computeBoardDiff(initialColumns, columns);
    expect(diff).toContainEqual({ taskId: "a", status: "in_progress", position: 1 });
    // b was second in todo; with a gone, it is first now -- a real change to
    // that column's arrangement, even though b itself was never dragged, so
    // the whole column is renumbered and b is reported too.
    expect(diff).toContainEqual({ taskId: "b", status: "todo", position: 0 });
    // c's column (in_progress) changed membership, so c is renumbered too,
    // even though its own position within it (0) happens not to move.
    expect(diff).toContainEqual({ taskId: "c", status: "in_progress", position: 0 });
    expect(hasUnsavedChanges(initialColumns, columns)).toBe(true);
  });

  it("reports a reorder within the same column, and leaves other columns alone", () => {
    const columns: BoardColumns = {
      todo: ["b", "a"],
      in_progress: ["c"],
      blocked: [],
      done: [],
    };

    const diff = computeBoardDiff(initialColumns, columns);
    expect(diff).toContainEqual({ taskId: "a", status: "todo", position: 1 });
    expect(diff).toContainEqual({ taskId: "b", status: "todo", position: 0 });
    // in_progress is byte-for-byte the same array it started as -- nothing
    // written for it, even though it holds a real task.
    expect(diff.some((c) => c.taskId === "c")).toBe(false);
    expect(diff).toHaveLength(2);
  });

  it("never throws on an id it does not recognise", () => {
    // computeBoardDiff has no lookup to fail -- it only ever reads the
    // columns it was handed. An id neither side has ever heard of just rides
    // along as part of whichever column changed; the server is what actually
    // verifies every id belongs to the project before writing anything (see
    // saveBoardChanges), not this pure function.
    const columns: BoardColumns = {
      todo: ["a", "b", "ghost"],
      in_progress: ["c"],
      blocked: [],
      done: [],
    };

    expect(() => computeBoardDiff(initialColumns, columns)).not.toThrow();
    expect(computeBoardDiff(initialColumns, columns)).toContainEqual({
      taskId: "ghost",
      status: "todo",
      position: 2,
    });
  });
});

describe("statusFieldsFor", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("touches nothing on a pure reorder", () => {
    const patch = statusFieldsFor("todo", "todo", now);
    expect(patch).toEqual({
      status: "todo",
      startedAt: undefined,
      completedAt: undefined,
      blockedAt: undefined,
      blockedReason: undefined,
      activityVerb: null,
    });
  });

  it("matches startTask when moving into in_progress", () => {
    const patch = statusFieldsFor("todo", "in_progress", now);
    expect(patch.status).toBe("in_progress");
    expect(patch.startedAt).toBe(now);
    expect(patch.completedAt).toBeNull();
    expect(patch.blockedAt).toBeNull();
    expect(patch.blockedReason).toBeNull();
    expect(patch.activityVerb).toBe("task.started");
  });

  it("matches completeTask when moving into done", () => {
    const patch = statusFieldsFor("in_progress", "done", now);
    expect(patch.status).toBe("done");
    expect(patch.completedAt).toBe(now);
    expect(patch.startedAt).toBeUndefined();
    expect(patch.blockedAt).toBeNull();
    expect(patch.blockedReason).toBeNull();
    expect(patch.activityVerb).toBe("task.completed");
  });

  it("matches reportBlocker when moving into blocked, and carries the reason", () => {
    const patch = statusFieldsFor("todo", "blocked", now, "Waiting on the client's logo files.");
    expect(patch.status).toBe("blocked");
    expect(patch.blockedAt).toBe(now);
    expect(patch.blockedReason).toBe("Waiting on the client's logo files.");
    expect(patch.activityVerb).toBe("task.blocked");
  });

  it("matches clearBlocker when moving from blocked to todo", () => {
    const patch = statusFieldsFor("blocked", "todo", now);
    expect(patch.status).toBe("todo");
    expect(patch.blockedAt).toBeNull();
    expect(patch.blockedReason).toBeNull();
    expect(patch.activityVerb).toBe("task.unblocked");
  });

  it("resets to todo with no activity verb when there was no blocker to clear", () => {
    // Dragging a done or in-progress card back to todo is a real move on this
    // board, but it has never had a name in this app -- see tasks.ts's own
    // vocabulary (started/completed/blocked/unblocked). No verb is invented.
    const fromDone = statusFieldsFor("done", "todo", now);
    expect(fromDone.status).toBe("todo");
    expect(fromDone.startedAt).toBeNull();
    expect(fromDone.completedAt).toBeNull();
    expect(fromDone.activityVerb).toBeNull();

    const fromInProgress = statusFieldsFor("in_progress", "todo", now);
    expect(fromInProgress.activityVerb).toBeNull();
  });
});
