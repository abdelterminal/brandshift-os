import { getTranslations } from "next-intl/server";

import { NewContactDialog } from "@/components/crm/create-dialogs";
import { PersonAvatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/feedback";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { listCompanies, listContacts } from "@/lib/data/crm";
import { cn } from "@/lib/utils";

/**
 * Contacts.
 *
 * A flat list across every company, because "what was that person's email"
 * does not start from knowing which company they are at -- and starting from
 * the company is already possible from the company's own page.
 *
 * There is no contact detail page. A contact is a name, a job title and two
 * ways to reach them; a page to show four fields is a page nobody needs, and
 * everything else about the relationship lives on the company or the deal.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Crm");
  return { title: t("contacts") };
}

export default async function ContactsPage() {
  const session = await requirePermission("crm.view");

  const [t, contacts, companies] = await Promise.all([
    getTranslations("Crm"),
    listContacts(session.actor),
    listCompanies(session.actor),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("contacts")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("contactsSubtitle")}</p>
        </div>
        <NewContactDialog
          companies={companies.map((company) => ({ id: company.id, label: company.name }))}
        />
      </header>

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

              {contact.companySlug ? (
                <Link
                  href={`/crm/companies/${contact.companySlug}`}
                  className={cn(
                    "text-caption text-fg-muted hover:text-fg-default shrink-0 rounded-[6px] px-1 py-0.5",
                    focusRing,
                    transition,
                  )}
                >
                  {contact.companyName}
                </Link>
              ) : (
                <span className="text-caption text-fg-subtle shrink-0">{t("noCompany")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
