import { getFormatter, getTranslations } from "next-intl/server";

import { StartReviewButton } from "@/components/reviews/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { dayKey } from "@/lib/calendar-dates";
import { listReviews, openDecisions } from "@/lib/data/reviews";
import { missedWeeks, weekToReview } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/**
 * The weeks, and the ones nobody wrote up.
 *
 * Exceptions first, as everywhere else: the weeks that ended without a review,
 * and the decisions from earlier reviews whose date has come and gone. A list
 * of the reviews you did hold is a diary; those two sections are the reason to
 * open the screen.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Reviews");
  return { title: t("title") };
}

export default async function ReviewsPage() {
  const session = await requirePermission("review.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, format, reviews, overdueDecisions] = await Promise.all([
    getTranslations("Reviews"),
    getFormatter(),
    listReviews(session.actor),
    openDecisions(session.actor, today),
  ]);

  const mayManage = can(session.actor, "review.manage");

  const missed = missedWeeks(
    reviews.map((review) => review.weekStart),
    today,
  );

  const lastWeek = weekToReview(today);
  const lastWeekDone = reviews.some((review) => review.weekStart === lastWeek);

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>

        {mayManage && !lastWeekDone ? (
          <StartReviewButton weekStart={lastWeek} heldOn={today} today={today} />
        ) : null}
      </header>

      {reviews.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : null}

      {overdueDecisions.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-1">{t("openDecisions")}</h2>
          <p className="text-caption text-fg-muted mb-3">{t("openDecisionsBody")}</p>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {overdueDecisions.map((decision) => (
              <li key={decision.id} className="px-4 py-3">
                <p className="text-body text-fg-default">{decision.decision}</p>
                <p className="text-caption text-fg-muted mt-0.5">
                  {[
                    decision.ownerName ?? t("unassigned"),
                    decision.dueDate ? t("dueBy", { date: day(decision.dueDate) }) : null,
                    t("fromWeek", { date: day(decision.weekStart) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {missed.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-1">{t("missed")}</h2>
          <p className="text-caption text-fg-muted mb-3">{t("missedBody")}</p>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {missed.map((week) => (
              <li key={week} className="text-body text-fg-muted px-4 py-3">
                {t("weekOf", { date: day(week) })}
              </li>
            ))}
          </ul>
        </section>
      ) : reviews.length > 0 ? (
        <p className="text-body text-fg-muted mb-8">{t("everyWeekReviewed")}</p>
      ) : null}

      {reviews.length > 0 ? (
        <section>
          <h2 className="text-heading text-fg-default mb-3">{t("allReviews")}</h2>
          <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {reviews.map((review) => (
              <li key={review.id}>
                <Link
                  href={`/reviews/${review.weekStart}`}
                  className={cn(
                    "hover:bg-surface-hover flex items-start justify-between gap-3 px-4 py-3.5",
                    focusRingInset,
                    transition,
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-body text-fg-default font-medium">
                      {t("weekOf", { date: day(review.weekStart) })}
                    </p>
                    <p className="text-caption text-fg-muted mt-0.5">
                      {[
                        review.facilitatorName
                          ? t("facilitator", { name: review.facilitatorName })
                          : null,
                        review.heldOn ? t("heldOn", { date: day(review.heldOn) }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <Badge tone={review.publishedAt ? "complete" : "neutral"}>
                    {review.publishedAt ? t("published") : t("draft")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
