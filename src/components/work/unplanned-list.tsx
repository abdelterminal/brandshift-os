import { getTranslations } from "next-intl/server";

import { PersonAvatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/feedback";
import { Link } from "@/i18n/navigation";

/** What `listUnplannedMembers()` returns, serialised for a Server Component. */
export type UnplannedItem = {
  userId: string;
  name: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  hoursSince: number;
};

/**
 * Who has joined a project and has not put a single task of their own on it
 * yet -- the coordination queue's fourth column, beside Blocked / Overdue /
 * Unassigned. Each row names the person and the project, not a task, because
 * there is no task to point at: that is the whole fact being reported.
 */
export async function UnplannedList({ items }: { items: UnplannedItem[] }) {
  const t = await getTranslations("Today");

  if (items.length === 0) {
    return <EmptyState title={t("noPlanEmpty")} className="py-8" />;
  }

  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <li key={`${item.userId}:${item.projectId}`} className="flex items-center gap-3 px-3 py-2.5">
          <PersonAvatar name={item.name} size="sm" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-default truncate font-medium">{item.name}</p>
            <Link
              href={`/work/${item.projectKey}`}
              className="text-caption text-fg-muted hover:text-fg-default block truncate hover:underline"
            >
              {item.projectName}
            </Link>
          </div>
          <span className="text-caption text-fg-subtle shrink-0 tabular-nums">
            {t("noPlanSince", { hours: Math.floor(item.hoursSince) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
