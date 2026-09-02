/**
 * Task shapes, with no server dependencies.
 *
 * These live apart from `tasks.ts` because Client Components need them --
 * the list, the drawer and the tabs all take `TaskRow` and name the buckets --
 * and `tasks.ts` is `server-only`. Importing a value from there into a client
 * module drags the database driver into the browser bundle, which fails the
 * build with a stack of missing Node built-ins and no obvious cause.
 *
 * Types alone would erase at compile time, but `BUCKET_ORDER` is a value, so
 * it has to be somewhere the client may legitimately reach.
 */

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  blockedReason: string | null;
  estimateHours: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
};

export type TaskBucket = "overdue" | "today" | "upcoming" | "noDeadline" | "completed";

/** The order the buckets are shown in, which is the order they matter in. */
export const BUCKET_ORDER: TaskBucket[] = [
  "overdue",
  "today",
  "upcoming",
  "noDeadline",
  "completed",
];
