import "server-only";

import { eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";

import { companies, contacts, deals, type CompanyStatus, type DealStage } from "@/db/schema/crm";
import { users } from "@/db/schema/people";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";
import { slugify } from "../slug";

/**
 * CRM reads and writes.
 *
 * The pipeline is the point of it, and the shape of the pipeline is one short
 * list of stages. Every CRM that grows a tenth stage grows it because somebody
 * wanted a report, and then nobody can remember what two of them mean.
 *
 * Money is `numeric` all the way through and comes back from the driver as a
 * string. It is parsed once, here, at the edge -- a float that has been through
 * a sum is a rounding error waiting for an invoice, and this column is what
 * ERP will invoice against.
 */

export type { CompanyStatus, DealStage };

/**
 * The pipeline, in order.
 *
 * `won` and `lost` are stages rather than a flag, because a deal is always
 * somewhere and "closed" is somewhere. They are last so the board reads left
 * to right as the thing actually progresses.
 */
export const DEAL_STAGES: readonly DealStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

/** The stages a deal is still live in. */
export const OPEN_STAGES: readonly DealStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
] as const;

export function isOpenStage(stage: DealStage): boolean {
  return OPEN_STAGES.includes(stage);
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  industry: string | null;
  status: CompanyStatus;
  notes: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

const COMPANY_FIELDS = {
  id: companies.id,
  name: companies.name,
  slug: companies.slug,
  website: companies.website,
  industry: companies.industry,
  status: companies.status,
  notes: companies.notes,
  ownerUserId: companies.ownerUserId,
  ownerName: users.name,
};

/** Left: a company need not have an owner. */
const COMPANY_JOIN = [
  { table: users, on: eq(users.id, companies.ownerUserId), type: "left" as const },
];

export type CompanyFilter = { query?: string; status?: CompanyStatus };

export async function listCompanies(
  actor: Actor,
  filter: CompanyFilter = {},
): Promise<CompanyRow[]> {
  const trimmed = filter.query?.trim();

  const rows = (await withOrg(actor.organizationId).selectJoined(
    companies,
    COMPANY_FIELDS,
    COMPANY_JOIN,
    isNull(companies.archivedAt),
    filter.status ? eq(companies.status, filter.status) : undefined,
    trimmed
      ? or(ilike(companies.name, `%${trimmed}%`), ilike(companies.industry, `%${trimmed}%`))
      : undefined,
  )) as CompanyRow[];

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCompanyBySlug(actor: Actor, slug: string): Promise<CompanyRow | null> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    companies,
    COMPANY_FIELDS,
    COMPANY_JOIN,
    eq(companies.slug, slug.toLowerCase()),
  )) as CompanyRow[];

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  notes: string | null;
  companyId: string | null;
  companyName: string | null;
  companySlug: string | null;
};

const CONTACT_FIELDS = {
  id: contacts.id,
  name: contacts.name,
  email: contacts.email,
  phone: contacts.phone,
  jobTitle: contacts.jobTitle,
  notes: contacts.notes,
  companyId: contacts.companyId,
  companyName: companies.name,
  companySlug: companies.slug,
};

/** Left: a contact met at a conference has no company yet. */
const CONTACT_JOIN = [
  { table: companies, on: eq(companies.id, contacts.companyId), type: "left" as const },
];

export async function listContacts(actor: Actor, query?: string): Promise<ContactRow[]> {
  const trimmed = query?.trim();

  const rows = (await withOrg(actor.organizationId).selectJoined(
    contacts,
    CONTACT_FIELDS,
    CONTACT_JOIN,
    isNull(contacts.archivedAt),
    trimmed
      ? or(
          ilike(contacts.name, `%${trimmed}%`),
          ilike(contacts.email, `%${trimmed}%`),
          ilike(companies.name, `%${trimmed}%`),
        )
      : undefined,
  )) as ContactRow[];

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function listCompanyContacts(actor: Actor, companyId: string): Promise<ContactRow[]> {
  return withOrg(actor.organizationId).selectJoined(
    contacts,
    CONTACT_FIELDS,
    CONTACT_JOIN,
    eq(contacts.companyId, companyId),
    isNull(contacts.archivedAt),
  ) as Promise<ContactRow[]>;
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export type DealRow = {
  id: string;
  title: string;
  stage: DealStage;
  /** Parsed once, here. `numeric` arrives as a string. */
  value: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  notes: string | null;
  lostReason: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  primaryContactId: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

const DEAL_FIELDS = {
  id: deals.id,
  title: deals.title,
  stage: deals.stage,
  value: deals.value,
  expectedCloseDate: deals.expectedCloseDate,
  source: deals.source,
  notes: deals.notes,
  lostReason: deals.lostReason,
  wonAt: deals.wonAt,
  lostAt: deals.lostAt,
  createdAt: deals.createdAt,
  companyId: deals.companyId,
  companyName: companies.name,
  companySlug: companies.slug,
  primaryContactId: deals.primaryContactId,
  ownerUserId: deals.ownerUserId,
  ownerName: users.name,
};

const DEAL_JOINS = [
  { table: companies, on: eq(companies.id, deals.companyId), type: "inner" as const },
  { table: users, on: eq(users.id, deals.ownerUserId), type: "left" as const },
];

function toDeals(rows: Array<Record<string, unknown>>): DealRow[] {
  return rows.map((row) => ({
    ...(row as unknown as DealRow),
    value: row.value === null ? null : Number(row.value),
  }));
}

export type DealFilter = {
  query?: string;
  stage?: DealStage;
  ownerUserId?: string;
  /** Won and lost deals are hidden unless asked for. */
  includeClosed?: boolean;
};

export async function listDeals(actor: Actor, filter: DealFilter = {}): Promise<DealRow[]> {
  const trimmed = filter.query?.trim();

  const rows = await withOrg(actor.organizationId).selectJoined(
    deals,
    DEAL_FIELDS,
    DEAL_JOINS,
    filter.stage ? eq(deals.stage, filter.stage) : undefined,
    filter.stage || filter.includeClosed ? undefined : inArray(deals.stage, [...OPEN_STAGES]),
    filter.ownerUserId ? eq(deals.ownerUserId, filter.ownerUserId) : undefined,
    trimmed
      ? or(ilike(deals.title, `%${trimmed}%`), ilike(companies.name, `%${trimmed}%`))
      : undefined,
  );

  return toDeals(rows as Array<Record<string, unknown>>).sort(
    (a, b) =>
      DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage) ||
      // Then by what closes soonest: a pipeline is a queue with dates on it.
      (a.expectedCloseDate ?? "9999-99-99").localeCompare(b.expectedCloseDate ?? "9999-99-99") ||
      (b.value ?? 0) - (a.value ?? 0),
  );
}

export async function getDeal(actor: Actor, dealId: string): Promise<DealRow | null> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    deals,
    DEAL_FIELDS,
    DEAL_JOINS,
    eq(deals.id, dealId),
  );

  return toDeals(rows as Array<Record<string, unknown>>)[0] ?? null;
}

export function listCompanyDeals(actor: Actor, companyId: string): Promise<DealRow[]> {
  return listDeals(actor, { includeClosed: true }).then((rows) =>
    rows.filter((deal) => deal.companyId === companyId),
  );
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export type StageSummary = { stage: DealStage; deals: DealRow[]; value: number };

/**
 * Deals grouped by stage, with what each stage is worth.
 *
 * The total is a sum of real figures on real deals -- not a forecast weighted
 * by a probability somebody invented for each stage. A weighted pipeline looks
 * more sophisticated and is a number nobody can check.
 */
export function groupByStage(rows: DealRow[]): StageSummary[] {
  return DEAL_STAGES.map((stage) => {
    const inStage = rows.filter((deal) => deal.stage === stage);
    return {
      stage,
      deals: inStage,
      value: inStage.reduce((total, deal) => total + (deal.value ?? 0), 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function uniqueSlug(
  scope: ReturnType<typeof withOrg>,
  name: string,
  fallback: string,
): Promise<string> {
  const taken = new Set(
    (await scope.selectFields(companies, { slug: companies.slug })).map((row) => row.slug),
  );

  const base = slugify(name, fallback);
  if (!taken.has(base)) return base;

  // Two companies really can share a name. A suffix beats an insert that fails.
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type NewCompanyInput = {
  name: string;
  website: string | null;
  industry: string | null;
  status: CompanyStatus;
  ownerUserId: string | null;
};

export async function createCompany(
  actor: Actor,
  input: NewCompanyInput,
  executor?: Executor,
): Promise<{ id: string; slug: string } | null> {
  const scope = withOrg(actor.organizationId, executor);
  const slug = await uniqueSlug(scope, input.name, "company");

  const [created] = await scope.insert(companies, {
    name: input.name,
    slug,
    website: input.website,
    industry: input.industry,
    status: input.status,
    ownerUserId: input.ownerUserId,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id, slug: created.slug } : null;
}

export type NewContactInput = {
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyId: string | null;
};

export async function createContact(
  actor: Actor,
  input: NewContactInput,
): Promise<{ id: string } | null> {
  const [created] = await withOrg(actor.organizationId).insert(contacts, {
    name: input.name,
    email: input.email,
    phone: input.phone,
    jobTitle: input.jobTitle,
    companyId: input.companyId,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id } : null;
}

export type NewDealInput = {
  title: string;
  companyId: string;
  primaryContactId: string | null;
  value: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  ownerUserId: string | null;
};

export async function createDeal(
  actor: Actor,
  input: NewDealInput,
): Promise<{ id: string } | null> {
  const [created] = await withOrg(actor.organizationId).insert(deals, {
    title: input.title,
    companyId: input.companyId,
    primaryContactId: input.primaryContactId,
    // Back to a string on the way in: `numeric` keeps its precision only if it
    // never becomes a float.
    value: input.value === null ? null : input.value.toFixed(2),
    expectedCloseDate: input.expectedCloseDate,
    source: input.source,
    ownerUserId: input.ownerUserId ?? actor.userId,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id } : null;
}

/**
 * Move a deal along.
 *
 * Winning and losing stamp their own timestamp, and losing keeps the reason.
 * A pipeline with no reasons on the lost deals teaches nobody anything, which
 * is most of what a pipeline is for after the fact.
 *
 * Moving a closed deal back into play clears the stamp, because otherwise the
 * next report counts it as won twice.
 */
export async function moveDealToStage(
  actor: Actor,
  dealId: string,
  stage: DealStage,
  lostReason: string | null,
): Promise<boolean> {
  const now = new Date();

  const rows = await withOrg(actor.organizationId).update(
    deals,
    {
      stage,
      wonAt: stage === "won" ? now : null,
      lostAt: stage === "lost" ? now : null,
      lostReason: stage === "lost" ? lostReason : null,
      updatedAt: now,
    },
    eq(deals.id, dealId),
    // Only if it is actually moving. Writing the same stage again would stamp
    // a fresh `wonAt` and record a second "moved to won" in the activity feed
    // for something that did not move.
    ne(deals.stage, stage),
  );

  return rows.length > 0;
}

export type DealUpdate = {
  title?: string;
  value?: number | null;
  expectedCloseDate?: string | null;
  primaryContactId?: string | null;
  ownerUserId?: string | null;
  source?: string | null;
  notes?: string | null;
};

export async function updateDeal(
  actor: Actor,
  dealId: string,
  patch: DealUpdate,
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.title !== undefined) set.title = patch.title;
  if (patch.value !== undefined) set.value = patch.value === null ? null : patch.value.toFixed(2);
  if (patch.expectedCloseDate !== undefined) set.expectedCloseDate = patch.expectedCloseDate;
  if (patch.primaryContactId !== undefined) set.primaryContactId = patch.primaryContactId;
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId;
  if (patch.source !== undefined) set.source = patch.source;
  if (patch.notes !== undefined) set.notes = patch.notes;

  const rows = await withOrg(actor.organizationId).update(deals, set, eq(deals.id, dealId));
  return rows.length > 0;
}

export async function updateCompanyNotes(
  actor: Actor,
  companyId: string,
  notes: string,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    companies,
    { notes: notes || null, updatedAt: new Date() },
    eq(companies.id, companyId),
  );
  return rows.length > 0;
}
