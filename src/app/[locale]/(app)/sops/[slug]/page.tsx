import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { EditStepsDialog, MarkReviewedButton, StatusButton } from "@/components/sops/controls";
import { CaptureTemplateButton } from "@/components/templates/controls";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { dayKey } from "@/lib/calendar-dates";
import { getSop } from "@/lib/data/sops";

/**
 * One procedure.
 *
 * The steps are the page. Everything else -- who owns it, when it was last
 * checked, whether it is still the way the work is done -- is context for
 * deciding whether to trust them.
 */
export const dynamic = "force-dynamic";

const STATE_TONE = {
  overdue: "attention",
  never: "attention",
  due_soon: "neutral",
  current: "complete",
} as const;

const STATE_KEY = {
  overdue: "reviewOverdue",
  never: "reviewNever",
  due_soon: "reviewDueSoon",
  current: "reviewCurrent",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("sop.view");
  const today = dayKey(new Date(), session.organization.timezone);
  const sop = await getSop(session.actor, slug, today);
  return { title: sop?.title ?? "" };
}

export default async function SopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("sop.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const sop = await getSop(session.actor, slug, today);
  if (!sop) notFound();

  const [t, templateText, format] = await Promise.all([
    getTranslations("Sops"),
    getTranslations("Templates"),
    getFormatter(),
  ]);

  const mayManage = can(session.actor, "sop.manage");
  const mayReview = can(session.actor, "sop.review", {
    ownerUserId: sop.ownerUserId ?? undefined,
  });

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
            <h1 className="text-display font-display text-fg-default">{sop.title}</h1>
            <p className="text-caption text-fg-muted mt-1.5">
              {[
                sop.ownerName ?? t("unassigned"),
                sop.departmentName ?? t("wholeCompany"),
                t("reviewIntervalDays", { days: sop.reviewIntervalDays }),
              ].join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-start gap-2">
            {sop.status !== "published" ? (
              <Badge tone="neutral">
                {sop.status === "draft" ? t("statusDraft") : t("statusRetired")}
              </Badge>
            ) : null}
            <Badge tone={STATE_TONE[sop.state]}>{t(STATE_KEY[sop.state])}</Badge>
          </div>
        </div>

        {sop.summary ? <p className="text-body text-fg-default mt-3">{sop.summary}</p> : null}
      </header>

      {/*
        The review line, given its own box because it is the question somebody
        opening a procedure actually has: can I trust this?
      */}
      <section className="border-border bg-surface-sunken mb-8 rounded-card border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {sop.lastReviewedOn ? (
              <>
                <p className="text-body text-fg-default">
                  {t("reviewedOn", {
                    date: day(sop.lastReviewedOn),
                    name: sop.lastReviewedByName ?? sop.ownerName ?? "",
                  })}
                </p>
                {sop.reviewDueOn ? (
                  <p className="text-caption text-fg-muted mt-0.5">
                    {t("dueOn", { date: day(sop.reviewDueOn) })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-body text-fg-default">{t("neverReviewed")}</p>
            )}
          </div>

          {mayReview ? <MarkReviewedButton sopId={sop.id} today={today} /> : null}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-heading text-fg-default">{t("steps")}</h2>
          {mayManage ? (
            <EditStepsDialog
              sopId={sop.id}
              initialSteps={sop.steps.map((step) => ({ title: step.title, detail: step.detail }))}
            />
          ) : null}
        </div>

        {sop.steps.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noSteps")}</p>
        ) : (
          <ol className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {sop.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3 px-4 py-3">
                <span
                  className="text-caption text-fg-muted mt-0.5 shrink-0 tabular-nums"
                  aria-hidden
                >
                  {index + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-body text-fg-default">{step.title}</p>
                  {step.detail ? (
                    <p className="text-caption text-fg-muted mt-1">{step.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {mayManage ? (
        <section className="flex flex-wrap justify-end gap-2">
          {/*
            The link the SOP milestone was built to make possible: a procedure
            says what happens and in what order, and a template is that turned
            into tasks with dates against them.
          */}
          {sop.steps.length > 0 ? (
            <CaptureTemplateButton
              from="sop"
              sourceId={sop.id}
              suggestedName={sop.title}
              label={templateText("captureFromSop")}
            />
          ) : null}
          <StatusButton sopId={sop.id} status={sop.status} />
        </section>
      ) : null}
    </div>
  );
}
