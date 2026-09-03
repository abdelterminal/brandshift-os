import { getFormatter, getTranslations } from "next-intl/server";

import { NewDealDialog } from "@/components/crm/create-dialogs";
import { DealBoard, DealList } from "@/components/crm/pipeline";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { groupByStage, listCompanies, listContacts, listDeals } from "@/lib/data/crm";
import { listPeople } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * The pipeline.
 *
 * A list by default, a board behind a toggle. Same call and same reason as
 * tasks: a list answers "what is happening and when", a board answers "what
 * shape is the pipeline", and people arrive with the first question.
 *
 * Every choice is in the URL, as on the calendar, so a filtered pipeline is
 * something you can send somebody.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Crm");
  return { title: t("title") };
}

function parseOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export default async function PipelinePage({ searchParams }: PageProps<"/[locale]/crm">) {
  const session = await requirePermission("crm.view");
  const params = await searchParams;

  const view = parseOne(params.view, ["list", "board"] as const, "list");
  const closed = parseOne(params.closed, ["open", "all"] as const, "open");
  const query = typeof params.q === "string" ? params.q : "";

  const currency = session.organization.currency;
  const today = dayKey(new Date(), session.organization.timezone);

  const [t, format, deals, companies, contacts, people] = await Promise.all([
    getTranslations("Crm"),
    getFormatter(),
    listDeals(session.actor, { query, includeClosed: closed === "all" }),
    listCompanies(session.actor),
    listContacts(session.actor),
    listPeople(session.actor, { pageSize: 100 }),
  ]);

  const summaries = groupByStage(deals);
  const openValue = deals
    .filter((deal) => deal.stage !== "won" && deal.stage !== "lost")
    .reduce((total, deal) => total + (deal.value ?? 0), 0);
  const openCount = deals.filter(
    (deal) => deal.stage !== "won" && deal.stage !== "lost",
  ).length;

  const href = (next: Record<string, string>) => {
    const search = new URLSearchParams({ view, closed, ...(query ? { q: query } : {}), ...next });
    return `/crm?${search.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
            <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="link" render={<Link href="/crm/companies" />}>
              {t("companies")}
            </Button>
            <Button variant="link" render={<Link href="/crm/contacts" />}>
              {t("contacts")}
            </Button>
            <NewDealDialog
              companies={companies.map((company) => ({
                id: company.id,
                label: company.name,
              }))}
              contacts={contacts.map((contact) => ({
                id: contact.id,
                label: contact.name,
                companyId: contact.companyId,
              }))}
              people={people.rows.map((person) => ({
                id: person.userId,
                label: person.name,
              }))}
            />
          </div>
        </div>

        {/*
          One figure, and it is a sum of real numbers on real deals -- not a
          forecast weighted by a probability somebody invented per stage. A
          weighted pipeline looks more sophisticated and is a number nobody
          can check.
        */}
        {openCount > 0 ? (
          <p className="text-body text-fg-muted mt-3 tabular-nums">
            {t("openValue", {
              value: format.number(openValue, {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
              }),
              count: openCount,
            })}
          </p>
        ) : null}
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          legend={t("viewLabel")}
          current={view}
          options={[
            { value: "list", label: t("listView"), href: href({ view: "list" }) },
            { value: "board", label: t("boardView"), href: href({ view: "board" }) },
          ]}
        />
        <Segmented
          legend={t("closedLabel")}
          current={closed}
          options={[
            { value: "open", label: t("hideClosed"), href: href({ closed: "open" }) },
            { value: "all", label: t("showClosed"), href: href({ closed: "all" }) },
          ]}
        />
      </div>

      {deals.length === 0 && !query ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noDeals")} description={t("noDealsBody")} />
        </div>
      ) : view === "list" ? (
        <DealList deals={deals} currency={currency} today={today} />
      ) : (
        <DealBoard summaries={summaries} currency={currency} />
      )}
    </div>
  );
}

/** The same segmented-link control the calendar uses: choices as places. */
function Segmented({
  legend,
  options,
  current,
}: {
  legend: string;
  options: Array<{ value: string; label: string; href: string }>;
  current: string;
}) {
  return (
    <div
      role="group"
      aria-label={legend}
      className="border-border bg-surface-sunken flex items-center gap-0.5 rounded-control border p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "text-label rounded-[6px] px-2.5 py-1",
              focusRing,
              transition,
              selected
                ? "bg-surface-raised text-fg-default font-semibold"
                : "text-fg-muted hover:text-fg-default",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
