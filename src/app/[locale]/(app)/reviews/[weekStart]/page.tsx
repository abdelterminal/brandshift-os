import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ReopenButton, ReviewEditor } from "@/components/reviews/controls";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { listPeople } from "@/lib/data/people";
import { getReview } from "@/lib/data/reviews";
import { weekRange } from "@/lib/reviews";

/**
 * One week's review.
 *
 * The numbers come first, because that is the order the meeting runs in: look
 * at what happened, then say what you make of it, then decide something. A
 * draft shows live figures and an editor; a published one shows the figures as
 * they stood and reads as the record it is.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;
  const t = await getTranslations("Reviews");
  return { title: t("weekOf", { date: weekStart }) };
}

export default async function ReviewPage({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;

  // The URL segment is the identity of the review, so a malformed one is a
  // 404 rather than a query that happens to match nothing.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) notFound();

  const session = await requirePermission("review.view");
  const review = await getReview(session.actor, weekStart);
  if (!review) notFound();

  const [t, format, people] = await Promise.all([
    getTranslations("Reviews"),
    getFormatter(),
    listPeople(session.actor, { pageSize: 100 }),
  ]);

  const mayManage = can(session.actor, "review.manage");
  const published = review.publishedAt !== null;
  const { start, end } = weekRange(review.weekStart);

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  /** The figures, in the order somebody would read them out. */
  const figures: Array<[string, number]> = [
    ["completed", review.snapshot.completed],
    ["created", review.snapshot.created],
    ["projectsAtRisk", review.snapshot.projectsAtRisk],
    ["blocked", review.snapshot.blocked],
    ["objectivesOpen", review.snapshot.objectivesOpen],
    ["objectivesBehind", review.snapshot.objectivesBehind],
    ["objectivesNotMeasured", review.snapshot.objectivesNotMeasured],
    ["proceduresOverdue", review.snapshot.proceduresOverdue],
    ["peopleAway", review.snapshot.peopleAway],
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">
            {t("weekOf", { date: day(review.weekStart) })}
          </h1>
          <p className="text-caption text-fg-muted mt-1.5">
            {[
              t("weekRange", { start: day(start), end: day(end) }),
              review.facilitatorName ? t("facilitator", { name: review.facilitatorName }) : null,
              review.heldOn ? t("heldOn", { date: day(review.heldOn) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={published ? "complete" : "neutral"}>
            {published ? t("published") : t("draft")}
          </Badge>
          {mayManage && published ? <ReopenButton reviewId={review.id} /> : null}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-heading text-fg-default mb-1">{t("theWeek")}</h2>
        <p className="text-caption text-fg-muted mb-3">
          {published ? t("frozenNumbers") : t("liveNumbers")}
        </p>

        <dl className="border-border bg-surface-raised grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border p-4 sm:grid-cols-3">
          {figures.map(([key, value]) => (
            <div key={key}>
              <dt className="text-caption text-fg-muted">{t(key)}</dt>
              <dd className="text-heading text-fg-default tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {published ? (
        <>
          <section className="mb-8">
            <h2 className="text-heading text-fg-default mb-2">{t("highlights")}</h2>
            <p className="text-body text-fg-default whitespace-pre-line">
              {review.highlights || "—"}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-heading text-fg-default mb-2">{t("concerns")}</h2>
            <p className="text-body text-fg-default whitespace-pre-line">
              {review.concerns || "—"}
            </p>
          </section>

          <section>
            <h2 className="text-heading text-fg-default mb-3">{t("decisions")}</h2>
            {review.decisions.length === 0 ? (
              <p className="text-body text-fg-muted">{t("noDecisions")}</p>
            ) : (
              <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
                {review.decisions.map((decision) => (
                  <li key={decision.id} className="px-4 py-3">
                    <p className="text-body text-fg-default">{decision.decision}</p>
                    <p className="text-caption text-fg-muted mt-0.5">
                      {[
                        decision.ownerName ?? t("unassigned"),
                        decision.dueDate ? t("dueBy", { date: day(decision.dueDate) }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : mayManage ? (
        <ReviewEditor
          reviewId={review.id}
          people={people.rows.map((person) => ({ id: person.userId, label: person.name }))}
          initial={{
            highlights: review.highlights,
            concerns: review.concerns,
            decisions: review.decisions.map((decision) => ({
              decision: decision.decision,
              ownerUserId: decision.ownerUserId,
              dueDate: decision.dueDate,
            })),
          }}
        />
      ) : (
        // A draft is somebody's working notes. Everyone can see that the week
        // is being reviewed; the write-up appears when it is published.
        <p className="text-body text-fg-muted">{t("draft")}</p>
      )}
    </div>
  );
}
