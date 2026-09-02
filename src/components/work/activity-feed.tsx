import { getFormatter, getTranslations } from "next-intl/server";

import { PersonAvatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/feedback";
import type { ActivityRow } from "@/lib/data/activity";

/**
 * The activity feed.
 *
 * Every line is rendered from a message key, never from raw stored text: the
 * verb decides the sentence and the metadata fills the blanks, so the feed
 * reads in French for a French user rather than in whatever language the
 * person who caused it happened to be using.
 */
export async function ActivityFeed({ events }: { events: ActivityRow[] }) {
  const [t, work, format] = await Promise.all([
    getTranslations("Activity"),
    getTranslations("Work"),
    getFormatter(),
  ]);

  if (events.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={work("noActivity")} description={work("noActivityBody")} />
      </div>
    );
  }

  /**
   * `task.completed` in the database becomes `taskCompleted` as a message key.
   *
   * next-intl reads a dot as nesting, so a key containing one is rejected
   * outright -- the dotted verb is the domain vocabulary and stays in the
   * table, but the catalogue needs it flattened.
   */
  const messageKey = (verb: string) =>
    verb
      .split(".")
      .map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
      .join("");

  // A verb with no translation still renders a sensible line rather than the
  // key itself, which is what a missing entry would otherwise put on screen.
  const describe = (event: ActivityRow) => {
    const metadata = event.metadata as Record<string, string | undefined>;
    try {
      return t(messageKey(event.verb) as "taskCompleted", {
        title: metadata.title ?? "",
        status: metadata.status ?? "",
        to: metadata.to ?? "",
      });
    } catch {
      return t("unknown");
    }
  };

  return (
    <ol className="border-border divide-border bg-surface-raised divide-y rounded-card border">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 px-4 py-3">
          {event.actorName ? (
            <PersonAvatar name={event.actorName} size="sm" className="mt-0.5" />
          ) : (
            <span className="bg-surface-active mt-0.5 size-6 shrink-0 rounded-pill" aria-hidden />
          )}

          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-default">
              <span className="font-medium">{event.actorName ?? t("system")}</span>{" "}
              <span className="text-fg-muted">{describe(event)}</span>
            </p>
            <p className="text-caption text-fg-subtle mt-0.5">
              {format.relativeTime(event.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
