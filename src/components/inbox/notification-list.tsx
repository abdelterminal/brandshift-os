"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * Serialisable shape. The row type itself lives in a `server-only` module, and
 * dates cross the boundary as ISO strings because a Date does not survive it.
 */
export type InboxItem = {
  id: string;
  readAt: string | null;
  createdAt: string;
  verb: string;
  metadata: Record<string, unknown>;
  subjectType: string;
  subjectId: string;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectKey: string | null;
  projectName: string | null;
  channelSlug: string | null;
};

/**
 * The inbox list.
 *
 * Unread rows carry a dot, a tinted ground and a badge -- three signals, not
 * colour alone. Opening one marks it read: an inbox that needs a second
 * deliberate action to clear is one that stays permanently full, and then the
 * count on the rail stops meaning anything.
 */
export function NotificationList({ items }: { items: InboxItem[] }) {
  const t = useTranslations("Inbox");
  const n = useTranslations("Notification");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = items.filter((item) => item.readAt === null);

  if (items.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      </div>
    );
  }

  /**
   * `task.assigned` in the database becomes `taskAssigned` as a message key --
   * next-intl reads a dot as nesting and refuses a key containing one.
   */
  const messageKey = (verb: string) =>
    verb
      .split(".")
      .map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
      .join("");

  function describe(item: InboxItem) {
    const metadata = item.metadata as Record<string, string | undefined>;
    // The event's own metadata first. It records what the thing was called at
    // the time, and it is the only source for anything that is neither a task
    // nor a project -- a meeting title, for one.
    const title = metadata.title ?? item.taskTitle ?? item.projectName ?? n("aTask");
    try {
      return n(messageKey(item.verb) as "taskAssigned", { title, to: metadata.to ?? "" });
    } catch {
      return n("unknown");
    }
  }

  /** Where it takes you. A notification you cannot act on is just noise. */
  function href(item: InboxItem): string {
    if (item.subjectType === "meeting") return `/calendar/${item.subjectId}`;
    // A leave request has no page of its own: it is a row on the time-off
    // screen, which is where both halves of the conversation happen.
    if (item.subjectType === "leave") return "/leave";
    // A join request, its approval and its decline all point at the channel
    // itself -- the request lands you on the pending-requests panel there if
    // you can act on it, and the answer lands you on the conversation you can
    // now (or still can't) see.
    if (item.subjectType === "channel" && item.channelSlug) return `/channels/${item.channelSlug}`;
    if (item.projectKey && item.taskId) return `/work/${item.projectKey}?task=${item.taskId}`;
    if (item.projectKey) return `/work/${item.projectKey}`;
    return "/today";
  }

  const today = new Date().toDateString();
  const groups = [
    {
      key: "today" as const,
      items: items.filter((item) => new Date(item.createdAt).toDateString() === today),
    },
    {
      key: "earlier" as const,
      items: items.filter((item) => new Date(item.createdAt).toDateString() !== today),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body text-fg-muted tabular-nums">
          {t("unread", { count: unread.length })}
        </p>
        {unread.length > 0 ? (
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead();
                router.refresh();
              })
            }
          >
            {t("markAllRead")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <section key={group.key}>
              <h2 className="text-label text-fg-default mb-2">{t(group.key)}</h2>

              <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
                {group.items.map((item) => {
                  const isUnread = item.readAt === null;

                  return (
                    <li key={item.id}>
                      <Link
                        href={href(item)}
                        onClick={() => {
                          if (!isUnread) return;
                          startTransition(async () => {
                            await markNotificationRead(item.id);
                          });
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 px-3 py-3",
                          isUnread ? "bg-accent-subtle" : "bg-surface-raised",
                          "hover:bg-surface-hover",
                          focusRingInset,
                          transition,
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-2 size-1.5 shrink-0 rounded-pill",
                            isUnread ? "bg-accent" : "bg-transparent",
                          )}
                        />

                        {item.actorName ? (
                          <PersonAvatar name={item.actorName} size="sm" className="mt-0.5" />
                        ) : (
                          <span
                            aria-hidden
                            className="bg-surface-active mt-0.5 size-6 shrink-0 rounded-pill"
                          />
                        )}

                        <span className="min-w-0 flex-1">
                          <span className="text-body text-fg-default block">
                            <span className="font-medium">{item.actorName ?? n("system")}</span>{" "}
                            <span className="text-fg-muted">{describe(item)}</span>
                          </span>
                          <span className="text-caption text-fg-subtle mt-0.5 block">
                            {format.relativeTime(new Date(item.createdAt))}
                            {item.projectKey ? ` · ${item.projectKey}` : ""}
                          </span>
                        </span>

                        {isUnread ? (
                          <Badge tone="accent" size="sm" className="shrink-0">
                            {t("newBadge")}
                          </Badge>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
