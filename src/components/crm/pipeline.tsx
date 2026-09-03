import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import type { DealRow, DealStage, StageSummary } from "@/lib/data/crm";
import { cn } from "@/lib/utils";

/**
 * The pipeline.
 *
 * A list by default and a board behind a toggle -- the same call, and the same
 * reason, as tasks: a list answers "what is happening and when", a board
 * answers "what shape is the pipeline", and people arrive with the first
 * question. `CLAUDE.md` says lists before boards and means it here too.
 */

const STAGE_TONE: Record<DealStage, "neutral" | "active" | "attention" | "complete" | "blocked"> = {
  lead: "neutral",
  qualified: "active",
  proposal: "active",
  negotiation: "attention",
  won: "complete",
  lost: "blocked",
};

/** A deal's money, or the honest absence of it. */
async function Money({ value, currency }: { value: number | null; currency: string }) {
  const [t, format] = await Promise.all([getTranslations("Crm"), getFormatter()]);

  if (value === null) {
    return <span className="text-fg-subtle">{t("noValue")}</span>;
  }

  return (
    <span className="tabular-nums">
      {format.number(value, { style: "currency", currency, maximumFractionDigits: 0 })}
    </span>
  );
}

export async function DealList({
  deals,
  currency,
  today,
}: {
  deals: DealRow[];
  currency: string;
  today: string;
}) {
  const [t, stages, format] = await Promise.all([
    getTranslations("Crm"),
    getTranslations("DealStage"),
    getFormatter(),
  ]);

  if (deals.length === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("noDealsMatch")} description={t("noDealsMatchBody")} />
      </div>
    );
  }

  return (
    <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
      {deals.map((deal) => {
        // Late only while it is still live. A deal won last month is not
        // overdue, and colouring it as though it were would be noise.
        const late =
          deal.expectedCloseDate !== null &&
          deal.expectedCloseDate < today &&
          deal.stage !== "won" &&
          deal.stage !== "lost";

        return (
          <li key={deal.id}>
            <Link
              href={`/crm/deals/${deal.id}`}
              className={cn(
                "flex flex-wrap items-center gap-3 px-4 py-3",
                "hover:bg-surface-hover",
                focusRingInset,
                transition,
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="text-body text-fg-default block font-medium">{deal.title}</span>
                <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                  {[deal.companyName, deal.ownerName].filter(Boolean).join(" · ")}
                </span>
              </span>

              <span className="text-body text-fg-default shrink-0">
                <Money value={deal.value} currency={currency} />
              </span>

              <span className="text-caption shrink-0 tabular-nums">
                {deal.expectedCloseDate ? (
                  <span className={late ? "text-blocked-text font-medium" : "text-fg-muted"}>
                    {format.dateTime(new Date(`${deal.expectedCloseDate}T12:00:00Z`), {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                ) : (
                  <span className="text-fg-subtle">{t("noCloseDate")}</span>
                )}
              </span>

              <Badge tone={STAGE_TONE[deal.stage]} size="sm" className="shrink-0">
                {stages(deal.stage)}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The board.
 *
 * Secondary, and read-only: there is no dragging. A drag is a gesture with no
 * keyboard equivalent and no confirmation, and moving a deal to Lost has to
 * ask why -- which a drop cannot. Stages are changed on the deal itself, where
 * the question can be put.
 */
export async function DealBoard({
  summaries,
  currency,
}: {
  summaries: StageSummary[];
  currency: string;
}) {
  const [t, stages] = await Promise.all([getTranslations("Crm"), getTranslations("DealStage")]);

  return (
    // `relative` because `sr-only` is `position: absolute` and would otherwise
    // escape this scroll box and widen the page.
    <div className="relative overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {summaries.map((summary) => (
          <section key={summary.stage} className="w-64 shrink-0">
            <div className="mb-2">
              <h3 className="text-label text-fg-default flex items-center gap-2 font-semibold">
                {stages(summary.stage)}
                <span className="text-caption text-fg-subtle tabular-nums">
                  {summary.deals.length}
                </span>
              </h3>
              {/*
                A stage whose deals carry no figure is not a stage worth zero.
                Printing "€0" against an unpriced lead is a number somebody
                will later put in a forecast.
              */}
              <p className="text-caption text-fg-muted mt-0.5">
                <Money value={summary.value > 0 ? summary.value : null} currency={currency} />
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {summary.deals.length === 0 ? (
                <li className="border-border text-caption text-fg-subtle rounded-card border border-dashed px-3 py-6 text-center">
                  {t("emptyStage")}
                </li>
              ) : (
                summary.deals.map((deal) => (
                  <li key={deal.id}>
                    <Link
                      href={`/crm/deals/${deal.id}`}
                      className={cn(
                        "border-border bg-surface-raised block rounded-card border p-3",
                        "hover:bg-surface-hover hover:border-border-hover",
                        focusRingInset,
                        transition,
                      )}
                    >
                      <span className="text-body text-fg-default block font-medium">
                        {deal.title}
                      </span>
                      <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                        {deal.companyName}
                      </span>
                      <span className="text-caption text-fg-muted mt-1.5 block">
                        <Money value={deal.value} currency={currency} />
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
