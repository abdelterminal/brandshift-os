/**
 * A deliverable's lifecycle, as a small pure module.
 *
 * The status list has a shape: five working states in a line, and `cancelled`
 * off to the side. The forward/back controls on the panel step along that
 * line, so "what is next" and "what is previous" live here, tested, rather than
 * as a `switch` inlined in a component.
 */

export type DeliverableStatus =
  | "producing"
  | "internal_review"
  | "with_client"
  | "revising"
  | "published"
  | "cancelled";

/** The working states, in order. `cancelled` is not on the line. */
export const DELIVERABLE_FLOW = [
  "producing",
  "internal_review",
  "with_client",
  "revising",
  "published",
] as const satisfies readonly DeliverableStatus[];

export type DeliverableFlowStatus = (typeof DELIVERABLE_FLOW)[number];

export const DELIVERABLE_STATUSES: readonly DeliverableStatus[] = [
  ...DELIVERABLE_FLOW,
  "cancelled",
];

export function isDeliverableStatus(value: unknown): value is DeliverableStatus {
  return typeof value === "string" && (DELIVERABLE_STATUSES as readonly string[]).includes(value);
}

/** Not `published` and not `cancelled` -- still somewhere on the line. */
export function isDeliverableOpen(status: DeliverableStatus): boolean {
  return status !== "published" && status !== "cancelled";
}

/**
 * The next state on the line, or `null` at the end.
 *
 * `cancelled` and anything off the line has no next -- a cancelled deliverable
 * is reopened by setting a state explicitly, not by stepping.
 */
export function nextStatus(status: DeliverableStatus): DeliverableFlowStatus | null {
  const index = (DELIVERABLE_FLOW as readonly string[]).indexOf(status);
  if (index === -1 || index === DELIVERABLE_FLOW.length - 1) return null;
  return DELIVERABLE_FLOW[index + 1]!;
}

export function prevStatus(status: DeliverableStatus): DeliverableFlowStatus | null {
  const index = (DELIVERABLE_FLOW as readonly string[]).indexOf(status);
  if (index <= 0) return null;
  return DELIVERABLE_FLOW[index - 1]!;
}

/** Order a set of deliverables by where they are on the line, worst-behind first. */
export function compareByFlow(
  a: { status: DeliverableStatus; dueDate: string | null; title: string },
  b: { status: DeliverableStatus; dueDate: string | null; title: string },
): number {
  const rank = (s: DeliverableStatus) => {
    const i = (DELIVERABLE_STATUSES as readonly string[]).indexOf(s);
    return i === -1 ? DELIVERABLE_STATUSES.length : i;
  };
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  const ad = a.dueDate ?? "9999-99-99";
  const bd = b.dueDate ?? "9999-99-99";
  if (ad !== bd) return ad.localeCompare(bd);
  return a.title.localeCompare(b.title);
}
