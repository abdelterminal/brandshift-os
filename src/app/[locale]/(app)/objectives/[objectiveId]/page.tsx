import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  CloseObjectiveDialog,
  RecordCheckpointDialog,
  ReopenButton,
} from "@/components/objectives/dialogs";
import { ProgressBar } from "@/components/objectives/progress-bar";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { getObjective, listCheckpoints, type KeyResultView } from "@/lib/data/objectives";
import { progressPercent, valueToNumber } from "@/lib/objectives";

/**
 * One objective, and the figures behind it.
 *
 * Every number on this page carries the day it was recorded and the name of
 * whoever recorded it. That is the whole point of the screen: an objective
 * people can argue with, because they can see where its numbers came from.
 */
export const dynamic = "force-dynamic";

const HEALTH_TONE = {
  done: "complete",
  on_track: "active",
  at_risk: "attention",
  behind: "attention",
  not_measured: "neutral",
} as const;

const HEALTH_KEY = {
  done: "healthDone",
  on_track: "healthOnTrack",
  at_risk: "healthAtRisk",
  behind: "healthBehind",
  not_measured: "healthNotMeasured",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ objectiveId: string }> }) {
  const { objectiveId } = await params;
  const session = await requirePermission("objective.view");
  const objective = await getObjective(session.actor, objectiveId);
  return { title: objective?.title ?? "" };
}

async function KeyResultCard({
  keyResult,
  currency,
  today,
  mayRecord,
}: {
  keyResult: KeyResultView;
  currency: string;
  today: string;
  mayRecord: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("Objectives"), getFormatter()]);

  const percent = progressPercent(
    keyResult.startValue,
    keyResult.targetValue,
    keyResult.currentValue,
  );

  /** One place that turns a stored integer into something a person reads. */
  const show = (value: number) => {
    const plain = valueToNumber(value, keyResult.unit);
    if (keyResult.unit === "currency") {
      return format.number(plain, { style: "currency", currency });
    }
    if (keyResult.unit === "percent") return `${format.number(plain)}%`;
    return format.number(plain);
  };

  return (
    <li className="border-border bg-surface-raised rounded-card border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body text-fg-default font-medium">{keyResult.title}</p>
          <p className="text-caption text-fg-muted mt-0.5 tabular-nums">
            {`${t("startValue")} ${show(keyResult.startValue)} · ${t("targetValue")} ${show(
              keyResult.targetValue,
            )}`}
          </p>
        </div>

        {mayRecord ? (
          <RecordCheckpointDialog
            keyResultId={keyResult.id}
            keyResultTitle={keyResult.title}
            today={today}
          />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ProgressBar
          percent={percent}
          tone={keyResult.met ? "done" : percent === null ? "not_measured" : "on_track"}
          label={`${t("progress")} — ${keyResult.title}`}
        />
        <span className="text-body text-fg-default shrink-0 tabular-nums">
          {keyResult.currentValue === null ? t("notMeasured") : show(keyResult.currentValue)}
        </span>
      </div>

      {keyResult.measuredOn ? (
        <p className="text-caption text-fg-subtle mt-1.5">
          {t("measuredOn", {
            date: format.dateTime(new Date(`${keyResult.measuredOn}T00:00:00Z`), {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
          })}
        </p>
      ) : (
        <p className="text-caption text-fg-subtle mt-1.5">{t("notMeasuredBody")}</p>
      )}
    </li>
  );
}

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ objectiveId: string }>;
}) {
  const { objectiveId } = await params;
  const session = await requirePermission("objective.view");

  const objective = await getObjective(session.actor, objectiveId);
  if (!objective) notFound();

  const [t, format] = await Promise.all([getTranslations("Objectives"), getFormatter()]);

  const today = dayKey(new Date(), session.organization.timezone);
  const mayManage = can(session.actor, "objective.manage");
  const mayRecord = can(session.actor, "objective.record");

  const percent = objective.progress === null ? null : Math.round(objective.progress * 100);
  const elapsedPercent = Math.round(objective.elapsed * 100);

  // The history behind every key result on the page, in one pass.
  const histories = await Promise.all(
    objective.keyResults.map(async (keyResult) => ({
      keyResult,
      checkpoints: await listCheckpoints(session.actor, keyResult.id),
    })),
  );

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{objective.title}</h1>
            <p className="text-caption text-fg-muted mt-1.5">
              {[
                objective.ownerName ?? t("unassigned"),
                objective.departmentName ?? t("wholeCompany"),
                `${day(objective.periodStart)} – ${day(objective.periodEnd)}`,
              ].join(" · ")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={HEALTH_TONE[objective.health]}>{t(HEALTH_KEY[objective.health])}</Badge>
            {mayManage ? (
              objective.closedAt ? (
                <ReopenButton objectiveId={objective.id} />
              ) : (
                <CloseObjectiveDialog objectiveId={objective.id} title={objective.title} />
              )
            ) : null}
          </div>
        </div>

        {objective.description ? (
          <p className="text-body text-fg-default mt-3">{objective.description}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <ProgressBar
            percent={percent}
            tone={objective.health}
            label={`${t("progress")} — ${objective.title}`}
          />
          <span className="text-body text-fg-default shrink-0 tabular-nums">
            {percent === null ? t("notMeasured") : t("progressOf", { percent })}
          </span>
        </div>
        <p className="text-caption text-fg-subtle mt-1.5">
          {t("elapsed", { percent: elapsedPercent })}
        </p>
      </header>

      {objective.closedAt ? (
        <section className="border-border bg-surface-sunken mb-8 rounded-card border p-4">
          <p className="text-body text-fg-default font-medium">
            {t(
              objective.outcome === "achieved"
                ? "outcomeAchieved"
                : objective.outcome === "partly"
                  ? "outcomePartly"
                  : objective.outcome === "missed"
                    ? "outcomeMissed"
                    : "outcomeAbandoned",
            )}
          </p>
          {objective.closingNote ? (
            <p className="text-body text-fg-muted mt-1">{objective.closingNote}</p>
          ) : null}
          <p className="text-caption text-fg-subtle mt-1.5">
            {t("closedOn", {
              date: format.dateTime(objective.closedAt, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="text-heading text-fg-default mb-3">{t("keyResults")}</h2>
        <ul className="space-y-3">
          {objective.keyResults.map((keyResult) => (
            <KeyResultCard
              key={keyResult.id}
              keyResult={keyResult}
              currency={session.organization.currency}
              today={today}
              mayRecord={mayRecord && !objective.closedAt}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-heading text-fg-default mb-3">{t("history")}</h2>

        {histories.every((entry) => entry.checkpoints.length === 0) ? (
          <p className="text-body text-fg-muted">{t("noHistory")}</p>
        ) : (
          <div className="space-y-5">
            {histories
              .filter((entry) => entry.checkpoints.length > 0)
              .map((entry) => (
                <div key={entry.keyResult.id}>
                  <h3 className="text-label text-fg-default mb-2 font-semibold">
                    {entry.keyResult.title}
                  </h3>
                  <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
                    {entry.checkpoints.map((checkpoint) => (
                      <li key={checkpoint.id} className="px-4 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-body text-fg-default tabular-nums">
                            {entry.keyResult.unit === "currency"
                              ? format.number(
                                  valueToNumber(checkpoint.value, entry.keyResult.unit),
                                  { style: "currency", currency: session.organization.currency },
                                )
                              : entry.keyResult.unit === "percent"
                                ? `${format.number(valueToNumber(checkpoint.value, entry.keyResult.unit))}%`
                                : format.number(
                                    valueToNumber(checkpoint.value, entry.keyResult.unit),
                                  )}
                          </span>
                          <span className="text-caption text-fg-muted">
                            {`${day(checkpoint.recordedOn)} · ${checkpoint.recordedByName ?? ""}`}
                          </span>
                        </div>
                        {checkpoint.note ? (
                          <p className="text-caption text-fg-muted mt-1">{checkpoint.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
