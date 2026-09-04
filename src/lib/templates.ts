import { addDays } from "./calendar-dates";

/**
 * Turning a template into a schedule.
 *
 * Small and pure, and worth testing hard for the same reason the money and
 * objective arithmetic is: this decides what dates land on a real project's
 * board, and a template that quietly puts every deadline in the wrong week is
 * worse than no template -- people trust it, because it came from the last
 * time the job went well.
 */

export type TemplateTaskShape = {
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  /** Days after the project starts. `null` means the task has no deadline. */
  offsetDays: number | null;
};

/** A template task cannot be due before the project begins, or years after. */
export const MAX_OFFSET_DAYS = 730;

/**
 * The due date a task lands on, given the day the project starts.
 *
 * `null` in gives `null` out, deliberately: plenty of work in a project has no
 * date, and inventing one so the column is never empty is how a board fills up
 * with deadlines nobody believes.
 *
 * Offsets are calendar days rather than working days. A template that says
 * "delivery on day thirty" means thirty days, and quietly turning that into
 * six working weeks would surprise whoever wrote it -- the weekend rule
 * belongs to leave, where somebody's allowance is being spent.
 */
export function dueDateFor(startDate: string, offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  return addDays(startDate, Math.max(0, Math.min(MAX_OFFSET_DAYS, offsetDays)));
}

/** Every task, with its date worked out. The whole of "start from a template". */
export function scheduleFor(
  startDate: string,
  tasks: TemplateTaskShape[],
): Array<TemplateTaskShape & { dueDate: string | null }> {
  return tasks.map((task) => ({ ...task, dueDate: dueDateFor(startDate, task.offsetDays) }));
}

/**
 * Parse an offset as somebody typed it.
 *
 * Blank means no deadline, which is a real answer and not a mistake -- so it
 * returns `{ ok: true, value: null }` rather than an error. Anything that is
 * not a whole number is refused rather than read as day zero, which would put
 * a deadline on the first day of the project without anybody asking for one.
 */
export function parseOffset(input: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: null };

  if (!/^\d+$/.test(trimmed)) return { ok: false };

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value > MAX_OFFSET_DAYS) return { ok: false };

  return { ok: true, value };
}

/**
 * How long a template's work runs for, in days.
 *
 * `null` when nothing in it has a deadline. Shown on the list so somebody can
 * tell a two-week template from a two-month one without opening it.
 */
export function templateSpanDays(tasks: TemplateTaskShape[]): number | null {
  const offsets = tasks
    .map((task) => task.offsetDays)
    .filter((offset): offset is number => offset !== null);

  return offsets.length === 0 ? null : Math.max(...offsets);
}

/**
 * An SOP's steps, as template tasks.
 *
 * Every offset comes back `null`, on purpose. A procedure says what happens
 * and in what order; it says nothing about how long each part takes, and
 * spreading its steps one per day would be inventing a schedule nobody wrote.
 * The person adapting it puts the dates in, which is the moment they think
 * about the dates at all.
 */
export function fromSopSteps(
  steps: Array<{ title: string; detail: string | null }>,
): TemplateTaskShape[] {
  return steps.map((step) => ({
    title: step.title,
    description: step.detail,
    priority: "medium" as const,
    offsetDays: null,
  }));
}

/**
 * An existing project's tasks, as template tasks.
 *
 * Offsets are measured back from the project's start date, so a project that
 * ran well keeps its shape rather than its calendar. A task that was due
 * before the project officially started -- which happens, because start dates
 * get set after the fact -- clamps to day zero rather than going negative.
 */
export function fromProjectTasks(
  startDate: string | null,
  tasks: Array<{
    title: string;
    description: string | null;
    priority: "low" | "medium" | "high" | "urgent";
    dueDate: string | null;
  }>,
): TemplateTaskShape[] {
  return tasks.map((task) => ({
    title: task.title,
    description: task.description,
    priority: task.priority,
    offsetDays:
      startDate && task.dueDate
        ? Math.max(0, Math.min(MAX_OFFSET_DAYS, daysBetween(startDate, task.dueDate)))
        : null,
  }));
}

/** Whole days from one `YYYY-MM-DD` to another. Negative when it runs backwards. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
