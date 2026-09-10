import type { InboxItem } from "./notification-list";

/**
 * How a notification reads, and where it points -- shared by the inbox list
 * and the corner toasts so the two never word the same event differently.
 */

/**
 * `task.assigned` in the database becomes `taskAssigned` as a message key --
 * next-intl reads a dot as nesting and refuses a key containing one.
 */
export function notificationMessageKey(verb: string): string {
  return verb
    .split(".")
    .map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join("");
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function describeNotification(
  item: Pick<InboxItem, "verb" | "metadata" | "taskTitle" | "projectName">,
  n: Translator,
): string {
  const metadata = item.metadata as Record<string, string | undefined>;
  const title = metadata.title ?? item.taskTitle ?? item.projectName ?? n("aTask");
  try {
    return n(notificationMessageKey(item.verb), {
      // Spread the event's own metadata so a verb whose message names something
      // specific -- who is waiting, on what -- can reach it.
      ...(metadata as Record<string, string>),
      title,
      to: metadata.to ?? "",
    });
  } catch {
    return n("unknown");
  }
}

/** Where a notification takes you. One that cannot be acted on is just noise. */
export function notificationHref(
  item: Pick<
    InboxItem,
    "subjectType" | "subjectId" | "channelSlug" | "projectKey" | "taskId"
  >,
): string {
  if (item.subjectType === "meeting") return `/calendar/${item.subjectId}`;
  if (item.subjectType === "leave") return "/leave";
  if (item.subjectType === "channel" && item.channelSlug) return `/channels/${item.channelSlug}`;
  if (item.projectKey && item.taskId) return `/work/${item.projectKey}?task=${item.taskId}`;
  if (item.projectKey) return `/work/${item.projectKey}`;
  return "/today";
}
