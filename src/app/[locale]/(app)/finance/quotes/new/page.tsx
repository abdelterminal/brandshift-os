import { DocumentComposer } from "@/components/finance/composer";
import { requirePermission } from "@/lib/auth/guards";
import { listCompanies } from "@/lib/data/crm";
import { getLetterhead } from "@/lib/data/organization";

import { addDays, dayKey } from "@/lib/calendar-dates";
export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await requirePermission("finance.manage");
  const params = await searchParams;
  const today = dayKey(new Date(), session.organization.timezone);
  const [companies, letterhead] = await Promise.all([
    listCompanies(session.actor), getLetterhead(session.actor)
  ]);
  return <DocumentComposer kind="quote" companies={companies.map(c => ({ id: c.id, label: c.name }))}
    
    letterhead={letterhead} currency={session.organization.currency} today={today} dueDefault={addDays(today, 30)} defaultCompanyId={params.company} />;
}
