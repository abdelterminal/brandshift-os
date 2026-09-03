import { getTranslations } from "next-intl/server";

import { NewCompanyDialog } from "@/components/crm/create-dialogs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listCompanies, listDeals, type CompanyStatus } from "@/lib/data/crm";
import { listPeople } from "@/lib/data/people";
import { cn } from "@/lib/utils";

/**
 * Companies.
 *
 * The list carries each company's open-deal count, because "who are we talking
 * to right now" is the question people bring to this screen -- a directory
 * with no sign of activity is a directory nobody opens twice.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<CompanyStatus, "complete" | "active" | "neutral"> = {
  client: "complete",
  prospect: "active",
  former: "neutral",
};

export async function generateMetadata() {
  const t = await getTranslations("Crm");
  return { title: t("companies") };
}

export default async function CompaniesPage() {
  const session = await requirePermission("crm.view");

  const [t, statuses, companies, deals, people] = await Promise.all([
    getTranslations("Crm"),
    getTranslations("CompanyStatus"),
    listCompanies(session.actor),
    listDeals(session.actor),
    listPeople(session.actor, { pageSize: 100 }),
  ]);

  const openDeals = new Map<string, number>();
  for (const deal of deals) {
    openDeals.set(deal.companyId, (openDeals.get(deal.companyId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("companies")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("companiesSubtitle")}</p>
        </div>
        <NewCompanyDialog
          people={people.rows.map((person) => ({ id: person.userId, label: person.name }))}
        />
      </header>

      {companies.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noCompanies")} description={t("noCompaniesBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
          {companies.map((company) => {
            const open = openDeals.get(company.id) ?? 0;

            return (
              <li key={company.id}>
                <Link
                  href={`/crm/companies/${company.slug}`}
                  className={cn(
                    "flex flex-wrap items-center gap-3 px-4 py-3",
                    "hover:bg-surface-hover",
                    focusRingInset,
                    transition,
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-fg-default block font-medium">
                      {company.name}
                    </span>
                    <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                      {[company.industry, company.ownerName].filter(Boolean).join(" · ")}
                    </span>
                  </span>

                  {open > 0 ? (
                    <span className="text-caption text-fg-muted shrink-0 tabular-nums">
                      {t("openDeals", { count: open })}
                    </span>
                  ) : null}

                  <Badge tone={STATUS_TONE[company.status]} size="sm" className="shrink-0">
                    {statuses(company.status)}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
