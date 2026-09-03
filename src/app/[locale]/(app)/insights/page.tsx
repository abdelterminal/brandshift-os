import { getFormatter, getTranslations } from "next-intl/server";

import { WeekChart } from "@/components/insights/week-chart";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, CountBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import {
  loadByPerson,
  longestBlocked,
  projectsAtRisk,
  weeklyThroughput,
} from "@/lib/data/insights";
import { cn } from "@/lib/utils";

/**
 * Insights.
 *
 * Two rules from `CLAUDE.md` shaped every decision on this screen.
 *
 * **No invented dashboard metrics.** Everything counted here comes from a row
 * somebody made by using the app -- a `completed_at` set by pressing Complete,
 * a `blocked_at` set by reporting a blocker. Nothing is estimated, weighted or
 * scored.
 *
 * **Screens lead with next actions and exceptions, never vanity totals.** So
 * it opens with what has gone wrong, ranked, every row a link to the thing you
 * would open to fix it. The trend sits underneath, where a trend belongs, and
 * there is no headline number anywhere.
 *
 * The rail already hides Insights without the `insights` module flag; the
 * guard below is the other half of the same rule, so typing the URL is refused
 * too -- with a 403, which leaves the session and whatever you were in the
 * middle of intact.
 */

export const dynamic = "force-dynamic";

/** Long enough to show a bad fortnight, short enough to stay readable. */
const WEEKS = 12;

export async function generateMetadata() {
  const t = await getTranslations("Insights");
  return { title: t("title") };
}

export default async function InsightsPage() {
  const session = await requirePermission("insights.view");

  const timeZone = session.organization.timezone;
  const now = new Date();
  const today = dayKey(now, timeZone);

  const [t, format, atRisk, throughput, load, blocked] = await Promise.all([
    getTranslations("Insights"),
    getFormatter(),
    projectsAtRisk(session.actor, today),
    weeklyThroughput(session.actor, WEEKS, today, timeZone),
    loadByPerson(session.actor, today, timeZone),
    longestBlocked(session.actor, now),
  ]);

  const row = cn(
    "flex w-full flex-wrap items-center gap-3 px-4 py-3",
    "hover:bg-surface-hover",
    focusRingInset,
    transition,
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
      </header>

      {/* What has gone wrong, first, because it is the only part anybody has
          to act on today. */}
      <section className="mb-8">
        <h2 className="text-heading font-display text-fg-default mb-1">{t("atRisk")}</h2>
        <p className="text-caption text-fg-muted mb-2">{t("atRiskBody")}</p>

        {atRisk.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("nothingAtRisk")} description={t("nothingAtRiskBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {atRisk.map((project) => (
              <li key={project.id}>
                <Link href={`/work/${project.key}`} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-fg-default block font-medium">
                      {project.name}
                    </span>
                    <span className="text-caption text-fg-subtle mt-0.5 block">
                      {project.key} · {t("openTasks", { count: project.openTasks })}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    {project.blocked > 0 ? (
                      <Badge tone="blocked" size="sm">
                        {t("blockedCount", { count: project.blocked })}
                      </Badge>
                    ) : null}
                    {project.overdue > 0 ? (
                      <Badge tone="attention" size="sm">
                        {t("overdueCount", { count: project.overdue })}
                      </Badge>
                    ) : null}
                    {project.pastDue ? (
                      <Badge tone="attention" size="sm">
                        {t("pastDue")}
                      </Badge>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-heading font-display text-fg-default mb-1">{t("stuck")}</h2>
        <p className="text-caption text-fg-muted mb-2">{t("stuckBody")}</p>

        {blocked.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("nothingStuck")} description={t("nothingStuckBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {blocked.map((task) => (
              <li key={task.id}>
                <Link
                  href={task.projectKey ? `/work/${task.projectKey}?task=${task.id}` : "/work"}
                  className={row}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-fg-default block">{task.title}</span>
                    <span className="text-caption text-fg-subtle mt-0.5 block">
                      {[task.projectKey, task.assigneeName].filter(Boolean).join(" · ")}
                      {task.reason ? ` — ${task.reason}` : ""}
                    </span>
                  </span>

                  <Badge tone="blocked" size="sm" className="shrink-0">
                    {t("daysBlocked", { count: task.daysBlocked })}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-heading font-display text-fg-default mb-1">{t("throughput")}</h2>
        <p className="text-caption text-fg-muted mb-2">{t("throughputBody")}</p>
        <WeekChart points={throughput} />
      </section>

      <section>
        <h2 className="text-heading font-display text-fg-default mb-1">{t("load")}</h2>
        <p className="text-caption text-fg-muted mb-2">{t("loadBody")}</p>

        {/* `relative` for the same reason the week chart needs it. */}
        <div className="border-border bg-surface-raised relative overflow-x-auto rounded-card border">
          <table className="w-full min-w-[42rem] border-collapse">
            <thead>
              <tr className="border-border border-b">
                <th
                  scope="col"
                  className="text-caption text-fg-muted px-4 py-2 text-left font-medium"
                >
                  {t("person")}
                </th>
                {(["open", "overdue", "blockedColumn", "meetings", "away"] as const).map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="text-caption text-fg-muted px-4 py-2 text-right font-medium"
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-border divide-y">
              {load.map((person) => (
                <tr key={person.userId}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <Link
                      href={`/people/${person.userId}`}
                      className={cn(
                        "flex items-center gap-2 rounded-[6px]",
                        focusRingInset,
                        transition,
                      )}
                    >
                      <PersonAvatar name={person.name} src={person.avatarUrl} size="sm" />
                      <span className="text-body text-fg-default truncate">{person.name}</span>
                    </Link>
                  </th>

                  <NumberCell value={person.open} />
                  <NumberCell value={person.overdue} tone="attention" />
                  <NumberCell value={person.blocked} tone="blocked" />
                  <td className="text-body text-fg-muted px-4 py-2 text-right tabular-nums">
                    {format.number(person.meetingHours)}
                  </td>
                  <NumberCell value={person.awayDays} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * A count, with a badge only when it is not zero.
 *
 * A column of red zeroes would make every row look like a problem, which is
 * exactly the noise that stops people reading the rows that are.
 */
function NumberCell({ value, tone }: { value: number; tone?: "attention" | "blocked" }) {
  return (
    <td className="px-4 py-2 text-right">
      {value > 0 && tone ? (
        <CountBadge tone={tone}>{value}</CountBadge>
      ) : (
        <span
          className={cn("text-body tabular-nums", value > 0 ? "text-fg-default" : "text-fg-subtle")}
        >
          {value}
        </span>
      )}
    </td>
  );
}
