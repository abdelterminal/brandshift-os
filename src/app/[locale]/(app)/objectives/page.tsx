import { getFormatter, getTranslations } from "next-intl/server";

import { NewObjectiveDialog } from "@/components/objectives/dialogs";
import { ProgressBar } from "@/components/objectives/progress-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";

import {
  listOpenObjectives,
  listClosedObjectives,
  type ObjectiveView,
} from "@/lib/data/objectives";
import { listDepartments, listPeople } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * What the company is trying to do.
 *
 * Exceptions first, as everywhere else in this app: what is behind, at risk,
 * or has never been measured, before what is going fine. A goals screen that
 * opens with a wall of green bars is a screen nobody reads twice.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Objectives");
  return { title: t("title") };
}

const HEALTH_TONE = {
  done: "complete",
  on_track: "active",
  at_risk: "attention",
  behind: "attention",
  not_measured: "neutral",
} as const;

async function ObjectiveRow({ objective }: { objective: ObjectiveView }) {
  const [t, format] = await Promise.all([getTranslations("Objectives"), getFormatter()]);

  const percent = objective.progress === null ? null : Math.round(objective.progress * 100);

  return (
    <li>
      <Link
        href={`/objectives/${objective.id}`}
        className={cn("hover:bg-surface-hover block px-4 py-3.5", focusRingInset, transition)}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-default font-medium">{objective.title}</p>
            <p className="text-caption text-fg-muted mt-0.5">
              {[
                objective.ownerName ?? t("unassigned"),
                objective.departmentName ?? t("wholeCompany"),
                format.dateTime(new Date(`${objective.periodEnd}T00:00:00Z`), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                }),
              ].join(" · ")}
            </p>
          </div>

          <Badge tone={HEALTH_TONE[objective.health]}>
            {t(
              objective.health === "done"
                ? "healthDone"
                : objective.health === "on_track"
                  ? "healthOnTrack"
                  : objective.health === "at_risk"
                    ? "healthAtRisk"
                    : objective.health === "behind"
                      ? "healthBehind"
                      : "healthNotMeasured",
            )}
          </Badge>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <ProgressBar
            percent={percent}
            tone={objective.health}
            label={`${t("progress")} — ${objective.title}`}
            className="max-w-xs"
          />
          <span className="text-caption text-fg-muted tabular-nums">
            {percent === null ? t("notMeasured") : t("progressOf", { percent })}
          </span>
        </div>
      </Link>
    </li>
  );
}

export default async function ObjectivesPage() {
  const session = await requirePermission("objective.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, open, closed, people, departments] = await Promise.all([
    getTranslations("Objectives"),
    listOpenObjectives(session.actor),
    listClosedObjectives(session.actor),
    listPeople(session.actor, { pageSize: 100 }),
    listDepartments(session.actor),
  ]);

  const mayManage = can(session.actor, "objective.manage");

  const attention = open.filter(
    (objective) =>
      objective.health === "behind" ||
      objective.health === "at_risk" ||
      objective.health === "not_measured",
  );
  const steady = open.filter((objective) => !attention.includes(objective));

  // The default period a new objective is offered: this calendar quarter.
  const now = new Date(`${today}T00:00:00Z`);
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3, 1))
    .toISOString()
    .slice(0, 10);
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), quarter * 3 + 3, 0))
    .toISOString()
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>

        {mayManage ? (
          <NewObjectiveDialog
            people={people.rows.map((person) => ({ id: person.userId, label: person.name }))}
            departments={departments.map((department) => ({
              id: department.id,
              label: department.name,
            }))}
            periodStart={periodStart}
            periodEnd={periodEnd}
          />
        ) : null}
      </header>

      {open.length === 0 && closed.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : null}

      {attention.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-1">{t("needsAttention")}</h2>
          <p className="text-caption text-fg-muted mb-3">{t("needsAttentionBody")}</p>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {attention.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} />
            ))}
          </ul>
        </section>
      ) : open.length > 0 ? (
        <p className="text-body text-fg-muted mb-8">{t("everythingOnTrack")}</p>
      ) : null}

      {steady.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-3">{t("open")}</h2>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {steady.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} />
            ))}
          </ul>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section>
          <h2 className="text-heading text-fg-default mb-3">{t("closed")}</h2>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {closed.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
