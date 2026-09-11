import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { NewContactDialog, NewDealDialog } from "@/components/crm/create-dialogs";
import { CompanyNotes } from "@/components/crm/stage-control";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRing, focusRingInset, quietLinkHover, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import {
  getCompanyBySlug,
  listCompanies,
  listCompanyContacts,
  listCompanyDeals,
  type CompanyStatus,
  type DealStage,
} from "@/lib/data/crm";
import { listPeople } from "@/lib/data/people";
import { readLocation } from "@/lib/meeting-location";
import { cn } from "@/lib/utils";

/**
 * One company.
 *
 * Everything that hangs off it, in the order somebody arriving needs it: what
 * is being sold, who to speak to, and what anybody has written down. The notes
 * are last because they are the thing you read once you already know the rest.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<CompanyStatus, "complete" | "active" | "neutral"> = {
  client: "complete",
  prospect: "active",
  former: "neutral",
};

const STAGE_TONE: Record<DealStage, "neutral" | "active" | "attention" | "complete" | "blocked"> = {
  lead: "neutral",
  qualified: "active",
  proposal: "active",
  negotiation: "attention",
  won: "complete",
  lost: "blocked",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/crm/companies/[slug]">) {
  const session = await requirePermission("crm.view");
  const { slug } = await params;
  const company = await getCompanyBySlug(session.actor, slug);
  return { title: company?.name ?? slug };
}

export default async function CompanyPage({ params }: PageProps<"/[locale]/crm/companies/[slug]">) {
  const session = await requirePermission("crm.view");
  const { slug } = await params;

  const company = await getCompanyBySlug(session.actor, slug);
  if (!company) notFound();

  const [t, statuses, stages, format, contacts, deals, companies, people] = await Promise.all([
    getTranslations("Crm"),
    getTranslations("CompanyStatus"),
    getTranslations("DealStage"),
    getFormatter(),
    listCompanyContacts(session.actor, company.id),
    listCompanyDeals(session.actor, company.id),
    listCompanies(session.actor),
    listPeople(session.actor, { pageSize: 100 }),
  ]);

  const currency = session.organization.currency;
  // The same guard the meeting location uses: only http and https become a
  // link, because this is a field somebody typed that ends up in an `href`.
  const site = readLocation(company.website);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{company.name}</h1>
          <p className="text-caption text-fg-muted mt-1 flex flex-wrap items-center gap-x-2">
            <Badge tone={STATUS_TONE[company.status]} size="sm">
              {statuses(company.status)}
            </Badge>
            {company.industry ? <span>{company.industry}</span> : null}
            {site?.kind === "link" ? (
              <a
                href={site.href}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(
                  "text-fg-default rounded-[6px] underline underline-offset-2",
                  quietLinkHover,
                  focusRing,
                  transition,
                )}
              >
                {site.host}
              </a>
            ) : site?.kind === "text" ? (
              <span>{site.text}</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NewContactDialog
            companies={companies.map((row) => ({ id: row.id, label: row.name }))}
            defaultCompanyId={company.id}
          />
          <NewDealDialog
            companies={companies.map((row) => ({ id: row.id, label: row.name }))}
            contacts={contacts.map((contact) => ({
              id: contact.id,
              label: contact.name,
              companyId: contact.companyId,
            }))}
            people={people.rows.map((person) => ({ id: person.userId, label: person.name }))}
            defaultCompanyId={company.id}
          />
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("title")}</h2>

        {deals.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("noDeals")} description={t("noDealsBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {deals.map((deal) => (
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
                    <span className="text-body text-fg-default block">{deal.title}</span>
                    <span className="text-caption text-fg-subtle mt-0.5 block tabular-nums">
                      {deal.value === null
                        ? t("noValue")
                        : format.number(deal.value, {
                            style: "currency",
                            currency,
                            maximumFractionDigits: 0,
                          })}
                    </span>
                  </span>

                  <Badge tone={STAGE_TONE[deal.stage]} size="sm" className="shrink-0">
                    {stages(deal.stage)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("contacts")}</h2>

        {contacts.length === 0 ? (
          <div className="border-border rounded-card border">
            <EmptyState title={t("noContacts")} description={t("noContactsBody")} />
          </div>
        ) : (
          <ul className="border-border divide-border bg-surface-raised divide-y overflow-hidden rounded-card border">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <PersonAvatar name={contact.name} size="sm" className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-body text-fg-default block">{contact.name}</span>
                  <span className="text-caption text-fg-subtle mt-0.5 block truncate">
                    {[contact.jobTitle, contact.email, contact.phone].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-label text-fg-default mb-2 font-semibold">{t("notes")}</h2>
        <CompanyNotes companyId={company.id} notes={company.notes} />
      </section>
    </div>
  );
}
