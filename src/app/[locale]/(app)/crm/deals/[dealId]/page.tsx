import { MessagesSquare } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { StageControl, type Stage } from "@/components/crm/stage-control";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listCompanyContacts, type DealStage } from "@/lib/data/crm";
import { getDeal } from "@/lib/data/crm";
import { cn } from "@/lib/utils";

/**
 * One deal.
 *
 * A routed page, because it is a thing you come back to and send people links
 * to. The stage control is here rather than on the board, so that losing one
 * can ask why -- a drag-and-drop gesture has nowhere to put that question, and
 * no keyboard equivalent either.
 */

export const dynamic = "force-dynamic";

const STAGE_TONE: Record<DealStage, "neutral" | "active" | "attention" | "complete" | "blocked"> = {
  lead: "neutral",
  qualified: "active",
  proposal: "active",
  negotiation: "attention",
  won: "complete",
  lost: "blocked",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/crm/deals/[dealId]">) {
  const session = await requirePermission("crm.view");
  const { dealId } = await params;
  const deal = await getDeal(session.actor, dealId);
  return { title: deal?.title ?? "" };
}

export default async function DealPage({ params }: PageProps<"/[locale]/crm/deals/[dealId]">) {
  const session = await requirePermission("crm.view");
  const { dealId } = await params;

  const deal = await getDeal(session.actor, dealId);
  if (!deal) notFound();

  const [t, stages, format, contacts] = await Promise.all([
    getTranslations("Crm"),
    getTranslations("DealStage"),
    getFormatter(),
    listCompanyContacts(session.actor, deal.companyId),
  ]);

  const currency = session.organization.currency;
  const primary = contacts.find((contact) => contact.id === deal.primaryContactId);

  const money = (value: number | null) =>
    value === null
      ? t("noValue")
      : format.number(value, { style: "currency", currency, maximumFractionDigits: 0 });

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{deal.title}</h1>
            <p className="text-caption text-fg-muted mt-1">
              <Link
                href={`/crm/companies/${deal.companySlug}`}
                className={cn(
                  "text-fg-default rounded-[6px] font-medium underline underline-offset-2",
                  focusRing,
                  transition,
                )}
              >
                {deal.companyName}
              </Link>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[deal.stage]}>{stages(deal.stage)}</Badge>

            {/*
              A link to a route that creates the channel if it does not exist
              yet, exactly as `/work/<key>/channel` does. One home per channel.
            */}
            <Button size="sm" render={<Link href={`/crm/deals/${deal.id}/channel`} />}>
              <MessagesSquare aria-hidden className="size-4" />
              {t("openChannel")}
            </Button>
          </div>
        </div>

        {deal.stage === "won" && deal.wonAt ? (
          <p role="status" className="text-body text-complete-text mt-2 font-medium">
            {t("wonAt", { date: format.dateTime(deal.wonAt, { dateStyle: "long" }) })}
          </p>
        ) : null}

        {deal.stage === "lost" && deal.lostAt ? (
          <div className="mt-2">
            <p role="status" className="text-body text-blocked-text font-medium">
              {t("lostAt", { date: format.dateTime(deal.lostAt, { dateStyle: "long" }) })}
            </p>
            {/* The reason, on the deal, where the next person looking will
                find it -- not only in the activity feed. */}
            {deal.lostReason ? (
              <p className="text-body text-fg-muted mt-1">{deal.lostReason}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      <dl className="border-border bg-surface-raised grid gap-4 rounded-card border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-caption text-fg-muted">{t("value")}</dt>
          <dd
            className={cn(
              "text-body mt-0.5 tabular-nums",
              deal.value === null ? "text-fg-subtle" : "text-fg-default",
            )}
          >
            {money(deal.value)}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-fg-muted">{t("closeDate")}</dt>
          <dd
            className={cn(
              "text-body mt-0.5 tabular-nums",
              deal.expectedCloseDate ? "text-fg-default" : "text-fg-subtle",
            )}
          >
            {deal.expectedCloseDate
              ? format.dateTime(new Date(`${deal.expectedCloseDate}T12:00:00Z`), {
                  dateStyle: "long",
                })
              : t("noCloseDate")}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-fg-muted">{t("owner")}</dt>
          <dd className="text-body text-fg-default mt-0.5 flex items-center gap-2">
            {deal.ownerName ? (
              <>
                <PersonAvatar name={deal.ownerName} size="xs" />
                {deal.ownerName}
              </>
            ) : (
              <span className="text-fg-subtle">—</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-fg-muted">{t("contact")}</dt>
          <dd className="text-body mt-0.5">
            {primary ? (
              <span className="text-fg-default">
                {primary.name}
                {primary.jobTitle ? (
                  <span className="text-fg-muted"> · {primary.jobTitle}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-fg-subtle">{t("noContactChosen")}</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-caption text-fg-muted">{t("source")}</dt>
          <dd
            className={cn(
              "text-body mt-0.5",
              deal.source ? "text-fg-default" : "text-fg-subtle",
            )}
          >
            {deal.source ?? t("noSource")}
          </dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("stage")}</h2>
        <StageControl dealId={deal.id} current={deal.stage as Stage} />
      </section>
    </div>
  );
}
