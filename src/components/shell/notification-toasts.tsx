"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { describeNotification, notificationHref } from "@/components/inbox/notification-copy";
import { useToast } from "@/components/ui/toast";

/**
 * New notifications, as animated boxes in the corner.
 *
 * The inbox is where notifications live; this is what makes one you should see
 * *now* actually get seen. It renders nothing itself -- it watches the unread
 * list the shell hands it (kept current by `LiveSync`'s refresh) and, when a
 * row appears that was not there a moment ago, drops a toast into the same
 * bottom-right viewport an action confirmation uses.
 *
 * The first render only remembers what is already there; those are history,
 * not news. A page reload does the same, so returning to a tab does not
 * replay a morning's worth of notifications.
 */

export type ToastNotification = {
  id: string;
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

export function NotificationToasts({ items }: { items: ToastNotification[] }) {
  const toast = useToast();
  const router = useRouter();
  const n = useTranslations("Notification");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((item) => item.id));
      return;
    }

    for (const item of items) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);

      toast.add({
        title: item.actorName ?? n("system"),
        description: describeNotification(item, n),
        timeout: 8000,
        data: { tone: "neutral" },
        actionProps: {
          children: n("view"),
          onClick: () => router.push(notificationHref(item)),
        },
      });
    }
  }, [items, toast, router, n]);

  return null;
}
