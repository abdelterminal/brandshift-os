import { getFormatter, getTranslations } from "next-intl/server";

import { NewSopDialog } from "@/components/sops/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { dayKey } from "@/lib/calendar-dates";
import { listDepartments, listPeople } from "@/lib/data/people";
import { listRetiredSops, listSops, type SopView } from "@/lib/data/sops";
import { needsAttention } from "@/lib/sops";
import { cn } from "@/lib/utils";

/**
 * The procedure library.
 *
 * Opens with what has gone stale, because that is the only thing on this
 * screen that is actively costing anybody anything: a procedure nobody has
 * checked in two years does not sit there harmlessly, it tells people to do
 * the wrong thing with the authority of being written down.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Sops");
  return { title: t("title") };
}

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

async function SopRow({ sop }: { sop: SopView }) {
  const [t, format] = await Promise.all([getTranslations("Sops"), getFormatter()]);

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <li>
      <Link
        href={`/sops/${sop.slug}`}
        className={cn("hover:bg-surface-hover block px-4 py-3.5", focusRingInset, transition)}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-default font-medium">{sop.title}</p>
            <p className="text-caption text-fg-muted mt-0.5">
              {[
                sop.ownerName ?? t("unassigned"),
                sop.departmentName ?? t("wholeCompany"),
                // The due date only when there is one. The badge beside this
                // already says "never reviewed", and saying it twice on one
                // row reads as a rendering bug rather than as emphasis.
                sop.reviewDueOn ? t("dueOn", { date: day(sop.reviewDueOn) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {sop.status === "draft" ? <Badge tone="neutral">{t("statusDraft")}</Badge> : null}
            <Badge tone={STATE_TONE[sop.state]}>{t(STATE_KEY[sop.state])}</Badge>
          </div>
        </div>
      </Link>
    </li>
  );
}

function List({ sops }: { sops: SopView[] }) {
  return (
    <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
      {sops.map((sop) => (
        <SopRow key={sop.id} sop={sop} />
      ))}
    </ul>
  );
}

export default async function SopsPage() {
  const session = await requirePermission("sop.view");
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, all, retired, people, departments] = await Promise.all([
    getTranslations("Sops"),
    listSops(session.actor, today),
    listRetiredSops(session.actor, today),
    listPeople(session.actor, { pageSize: 100 }),
    listDepartments(session.actor),
  ]);

  const mayManage = can(session.actor, "sop.manage");

  const stale = all.filter((sop) => needsAttention(sop.state));
  const rest = all.filter((sop) => !needsAttention(sop.state));

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>

        {mayManage ? (
          <NewSopDialog
            people={people.rows.map((person) => ({ id: person.userId, label: person.name }))}
            departments={departments.map((department) => ({
              id: department.id,
              label: department.name,
            }))}
          />
        ) : null}
      </header>

      {all.length === 0 && retired.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : null}

      {stale.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-1">{t("needsReview")}</h2>
          <p className="text-caption text-fg-muted mb-3">{t("needsReviewBody")}</p>
          <List sops={stale} />
        </section>
      ) : all.length > 0 ? (
        <p className="text-body text-fg-muted mb-8">{t("everythingCurrent")}</p>
      ) : null}

      {rest.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-heading text-fg-default mb-3">{t("library")}</h2>
          <List sops={rest} />
        </section>
      ) : null}

      {retired.length > 0 ? (
        <section>
          <h2 className="text-heading text-fg-default mb-1">{t("retired")}</h2>
          <p className="text-caption text-fg-muted mb-3">{t("retiredBody")}</p>
          <List sops={retired} />
        </section>
      ) : null}
    </div>
  );
}
