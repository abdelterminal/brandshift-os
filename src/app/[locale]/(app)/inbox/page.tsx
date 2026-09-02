import { getTranslations } from "next-intl/server";

import { NotificationList } from "@/components/inbox/notification-list";
import { requirePermission } from "@/lib/auth/guards";
import { listNotifications } from "@/lib/data/notifications";

/**
 * The inbox.
 *
 * Only what involves you -- work you were given, a blocker on something you
 * run, a change to what you may do. It is not a copy of the activity feed;
 * that lives on each project and person, where it belongs.
 */
export default async function InboxPage() {
  const session = await requirePermission("inbox.view");

  const [t, rows] = await Promise.all([
    getTranslations("Inbox"),
    listNotifications(session.actor),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
      </header>

      <NotificationList
        items={rows.map((row) => ({
          ...row,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
