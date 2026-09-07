import "server-only";

import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { companies } from "@/db/schema/crm";
import {
  expenses,
  invoiceLines,
  invoices,
  quoteLines,
  quotes,
  type ExpenseCategory,
  type InvoiceStatus,
  type QuoteStatus,
} from "@/db/schema/finance";
import { users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { withOrg, type Executor } from "@/db/tenancy";

import type { Actor } from "../authz";
import { fromDecimalString, lineTotal, toDecimalString, totalsFor, type Cents } from "../money";
import { isUuid } from "@/lib/uuid";

/**
 * Quotes, invoices and expenses.
 *
 * Everything monetary crosses this boundary as integer cents. `numeric` comes
 * back from the driver as a string and is parsed once, here; nothing above
 * this file ever sees a decimal string, and nothing below it ever sees a
 * float. `src/lib/money.ts` does the arithmetic.
 */

export type { ExpenseCategory, InvoiceStatus, QuoteStatus };

export type DocumentLine = {
  id: string;
  position: number;
  description: string;
  /** Bullets printed under the line, one per newline. */
  details: string | null;
  /** Bullets printed muted, after `details`. */
  exclusions: string | null;
  quantityThousandths: number;
  unitPrice: Cents;
  taxRateBasisPoints: number;
  lineTotal: Cents;
};

export type LineInput = {
  description: string;
  details: string | null;
  exclusions: string | null;
  quantityThousandths: number;
  unitPrice: Cents;
  taxRateBasisPoints: number;
};

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/**
 * The next document number for a year.
 *
 * Two things make this safe. It runs inside the caller's transaction, and it
 * locks the rows it counts -- so two people pressing Create at the same moment
 * queue rather than both reading the same maximum. And the column carries a
 * unique index per organization, so if the lock is ever wrong the database
 * refuses the second row rather than issuing a duplicate.
 *
 * A gap in the sequence is a missing document to an auditor, which is why
 * numbers are never reused and a sent invoice is voided rather than deleted.
 */
async function nextNumber(
  executor: Executor,
  organizationId: string,
  prefix: string,
  table: typeof quotes | typeof invoices,
  year: number,
): Promise<string> {
  const stem = `${prefix}-${year}-`;

  const rows = await executor
    .select({ number: table.number })
    .from(table)
    .where(and(eq(table.organizationId, organizationId), sql`${table.number} like ${`${stem}%`}`))
    .orderBy(desc(table.number))
    .limit(1)
    .for("update");

  const last = rows[0]?.number;
  const sequence = last ? Number(last.slice(stem.length)) + 1 : 1;

  return `${stem}${String(sequence).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteRow = {
  id: string;
  number: string;
  title: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string | null;
  terms: string | null;
  notes: string | null;
  declineReason: string | null;
  subtotal: Cents;
  taxTotal: Cents;
  total: Cents;
  sentAt: Date | null;
  decidedAt: Date | null;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  dealId: string | null;
  projectId: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

const QUOTE_FIELDS = {
  id: quotes.id,
  number: quotes.number,
  title: quotes.title,
  status: quotes.status,
  issueDate: quotes.issueDate,
  validUntil: quotes.validUntil,
  terms: quotes.terms,
  notes: quotes.notes,
  declineReason: quotes.declineReason,
  subtotal: quotes.subtotal,
  taxTotal: quotes.taxTotal,
  total: quotes.total,
  sentAt: quotes.sentAt,
  decidedAt: quotes.decidedAt,
  companyId: quotes.companyId,
  companyName: companies.name,
  companySlug: companies.slug,
  dealId: quotes.dealId,
  projectId: quotes.projectId,
  ownerUserId: quotes.ownerUserId,
  ownerName: users.name,
};

const QUOTE_JOINS = [
  { table: companies, on: eq(companies.id, quotes.companyId), type: "inner" as const },
  { table: users, on: eq(users.id, quotes.ownerUserId), type: "left" as const },
];

function toQuotes(rows: Array<Record<string, unknown>>): QuoteRow[] {
  return rows.map((row) => ({
    ...(row as unknown as QuoteRow),
    subtotal: fromDecimalString(row.subtotal as string) ?? 0,
    taxTotal: fromDecimalString(row.taxTotal as string) ?? 0,
    total: fromDecimalString(row.total as string) ?? 0,
  }));
}

export async function listQuotes(actor: Actor, status?: QuoteStatus): Promise<QuoteRow[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    quotes,
    QUOTE_FIELDS,
    QUOTE_JOINS,
    status ? eq(quotes.status, status) : undefined,
  );

  return toQuotes(rows as Array<Record<string, unknown>>).sort((a, b) =>
    b.number.localeCompare(a.number),
  );
}

export async function getQuote(actor: Actor, quoteId: string): Promise<QuoteRow | null> {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(quoteId)) return null;

  const rows = await withOrg(actor.organizationId).selectJoined(
    quotes,
    QUOTE_FIELDS,
    QUOTE_JOINS,
    eq(quotes.id, quoteId),
  );
  return toQuotes(rows as Array<Record<string, unknown>>)[0] ?? null;
}

export async function listQuoteLines(actor: Actor, quoteId: string): Promise<DocumentLine[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    quoteLines,
    {
      id: quoteLines.id,
      position: quoteLines.position,
      description: quoteLines.description,
      details: quoteLines.details,
      exclusions: quoteLines.exclusions,
      quantityThousandths: quoteLines.quantityThousandths,
      unitPrice: quoteLines.unitPrice,
      taxRateBasisPoints: quoteLines.taxRateBasisPoints,
      lineTotal: quoteLines.lineTotal,
    },
    eq(quoteLines.quoteId, quoteId),
  );

  return rows
    .map((row) => ({
      ...row,
      unitPrice: fromDecimalString(row.unitPrice) ?? 0,
      lineTotal: fromDecimalString(row.lineTotal) ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}

export type NewQuoteInput = {
  companyId: string;
  dealId: string | null;
  title: string;
  issueDate: string;
  validUntil: string | null;
  terms: string | null;
  lines: LineInput[];
};

/**
 * Draft a quote.
 *
 * The number is issued and the totals are computed in the same transaction as
 * the lines, so a quote can never exist with a number and no figures, or with
 * figures that do not match what it is made of.
 */
export async function createQuote(
  actor: Actor,
  input: NewQuoteInput,
): Promise<{ id: string; number: string } | null> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);
    const year = Number(input.issueDate.slice(0, 4));
    const number = await nextNumber(tx, actor.organizationId, "Q", quotes, year);
    const totals = totalsFor(input.lines);

    const [created] = await scope.insert(quotes, {
      number,
      companyId: input.companyId,
      dealId: input.dealId,
      title: input.title,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      terms: input.terms,
      subtotal: toDecimalString(totals.subtotal),
      taxTotal: toDecimalString(totals.tax),
      total: toDecimalString(totals.total),
      ownerUserId: actor.userId,
      createdByUserId: actor.userId,
    });
    if (!created) return null;

    if (input.lines.length > 0) {
      await scope.insert(
        quoteLines,
        input.lines.map((line, position) => ({
          quoteId: created.id,
          position,
          description: line.description,
          details: line.details,
          exclusions: line.exclusions,
          quantityThousandths: line.quantityThousandths,
          unitPrice: toDecimalString(line.unitPrice),
          taxRateBasisPoints: line.taxRateBasisPoints,
          lineTotal: toDecimalString(lineTotal(line.quantityThousandths, line.unitPrice)),
        })),
      );
    }

    return { id: created.id, number: created.number };
  });
}

/**
 * Move a quote along.
 *
 * Sending it freezes the totals -- from here the document is what the client
 * is holding, and a later edit to a line must not silently change what it
 * said. The status guard is in the `where`, so two people cannot both record
 * a decision.
 */
export async function setQuoteStatus(
  actor: Actor,
  quoteId: string,
  status: QuoteStatus,
  declineReason: string | null,
): Promise<boolean> {
  const now = new Date();

  const rows = await withOrg(actor.organizationId).update(
    quotes,
    {
      status,
      sentAt: status === "sent" ? now : undefined,
      decidedAt: status === "accepted" || status === "declined" ? now : undefined,
      declineReason: status === "declined" ? declineReason : null,
      updatedAt: now,
    },
    eq(quotes.id, quoteId),
    ne(quotes.status, status),
  );

  return rows.length > 0;
}

/** Link an accepted quote to the project the work became. */
export async function attachQuoteToProject(
  actor: Actor,
  quoteId: string,
  projectId: string,
  executor?: Executor,
): Promise<void> {
  await withOrg(actor.organizationId, executor).update(
    quotes,
    { projectId, updatedAt: new Date() },
    eq(quotes.id, quoteId),
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceRow = {
  id: string;
  number: string;
  title: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  terms: string | null;
  notes: string | null;
  voidReason: string | null;
  subtotal: Cents;
  taxTotal: Cents;
  total: Cents;
  paidAmount: Cents;
  sentAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  projectId: string | null;
  projectKey: string | null;
  quoteId: string | null;
};

const INVOICE_FIELDS = {
  id: invoices.id,
  number: invoices.number,
  title: invoices.title,
  status: invoices.status,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  terms: invoices.terms,
  notes: invoices.notes,
  voidReason: invoices.voidReason,
  subtotal: invoices.subtotal,
  taxTotal: invoices.taxTotal,
  total: invoices.total,
  paidAmount: invoices.paidAmount,
  sentAt: invoices.sentAt,
  paidAt: invoices.paidAt,
  voidedAt: invoices.voidedAt,
  companyId: invoices.companyId,
  companyName: companies.name,
  companySlug: companies.slug,
  projectId: invoices.projectId,
  projectKey: projects.key,
  quoteId: invoices.quoteId,
};

const INVOICE_JOINS = [
  { table: companies, on: eq(companies.id, invoices.companyId), type: "inner" as const },
  { table: projects, on: eq(projects.id, invoices.projectId), type: "left" as const },
];

function toInvoices(rows: Array<Record<string, unknown>>): InvoiceRow[] {
  return rows.map((row) => ({
    ...(row as unknown as InvoiceRow),
    subtotal: fromDecimalString(row.subtotal as string) ?? 0,
    taxTotal: fromDecimalString(row.taxTotal as string) ?? 0,
    total: fromDecimalString(row.total as string) ?? 0,
    paidAmount: fromDecimalString(row.paidAmount as string) ?? 0,
  }));
}

export async function listInvoices(actor: Actor, status?: InvoiceStatus): Promise<InvoiceRow[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    invoices,
    INVOICE_FIELDS,
    INVOICE_JOINS,
    status ? eq(invoices.status, status) : undefined,
  );

  return toInvoices(rows as Array<Record<string, unknown>>).sort((a, b) =>
    b.number.localeCompare(a.number),
  );
}

export async function getInvoice(actor: Actor, invoiceId: string): Promise<InvoiceRow | null> {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(invoiceId)) return null;

  const rows = await withOrg(actor.organizationId).selectJoined(
    invoices,
    INVOICE_FIELDS,
    INVOICE_JOINS,
    eq(invoices.id, invoiceId),
  );
  return toInvoices(rows as Array<Record<string, unknown>>)[0] ?? null;
}

export async function listInvoiceLines(actor: Actor, invoiceId: string): Promise<DocumentLine[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    invoiceLines,
    {
      id: invoiceLines.id,
      position: invoiceLines.position,
      description: invoiceLines.description,
      details: invoiceLines.details,
      exclusions: invoiceLines.exclusions,
      quantityThousandths: invoiceLines.quantityThousandths,
      unitPrice: invoiceLines.unitPrice,
      taxRateBasisPoints: invoiceLines.taxRateBasisPoints,
      lineTotal: invoiceLines.lineTotal,
    },
    eq(invoiceLines.invoiceId, invoiceId),
  );

  return rows
    .map((row) => ({
      ...row,
      unitPrice: fromDecimalString(row.unitPrice) ?? 0,
      lineTotal: fromDecimalString(row.lineTotal) ?? 0,
    }))
    .sort((a, b) => a.position - b.position);
}

export type NewInvoiceInput = {
  companyId: string;
  projectId: string | null;
  quoteId: string | null;
  title: string;
  issueDate: string;
  dueDate: string;
  terms: string | null;
  lines: LineInput[];
};

export async function createInvoice(
  actor: Actor,
  input: NewInvoiceInput,
): Promise<{ id: string; number: string } | null> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);
    const year = Number(input.issueDate.slice(0, 4));
    const number = await nextNumber(tx, actor.organizationId, "INV", invoices, year);
    const totals = totalsFor(input.lines);

    const [created] = await scope.insert(invoices, {
      number,
      companyId: input.companyId,
      projectId: input.projectId,
      quoteId: input.quoteId,
      title: input.title,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      terms: input.terms,
      subtotal: toDecimalString(totals.subtotal),
      taxTotal: toDecimalString(totals.tax),
      total: toDecimalString(totals.total),
      createdByUserId: actor.userId,
    });
    if (!created) return null;

    if (input.lines.length > 0) {
      await scope.insert(
        invoiceLines,
        input.lines.map((line, position) => ({
          invoiceId: created.id,
          position,
          description: line.description,
          details: line.details,
          exclusions: line.exclusions,
          quantityThousandths: line.quantityThousandths,
          unitPrice: toDecimalString(line.unitPrice),
          taxRateBasisPoints: line.taxRateBasisPoints,
          lineTotal: toDecimalString(lineTotal(line.quantityThousandths, line.unitPrice)),
        })),
      );
    }

    return { id: created.id, number: created.number };
  });
}

export async function sendInvoice(actor: Actor, invoiceId: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    invoices,
    { status: "sent", sentAt: new Date(), updatedAt: new Date() },
    eq(invoices.id, invoiceId),
    eq(invoices.status, "draft"),
  );
  return rows.length > 0;
}

/**
 * Record money arriving.
 *
 * Part payments are real, so the status follows the arithmetic rather than a
 * checkbox: anything short of the total leaves it part-paid, and only reaching
 * the total marks it paid. Read and written in one transaction, because two
 * payments landing together must not both read the same starting balance.
 */
export async function recordPayment(
  actor: Actor,
  invoiceId: string,
  amount: Cents,
): Promise<{ paid: Cents; status: InvoiceStatus } | null> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [current] = await scope.selectFields(
      invoices,
      { paidAmount: invoices.paidAmount, total: invoices.total, status: invoices.status },
      eq(invoices.id, invoiceId),
    );
    if (!current || current.status === "void" || current.status === "draft") return null;

    const paid = (fromDecimalString(current.paidAmount) ?? 0) + amount;
    const total = fromDecimalString(current.total) ?? 0;
    const status: InvoiceStatus = paid >= total ? "paid" : "part_paid";

    await scope.update(
      invoices,
      {
        paidAmount: toDecimalString(paid),
        status,
        paidAt: status === "paid" ? new Date() : null,
        updatedAt: new Date(),
      },
      eq(invoices.id, invoiceId),
    );

    return { paid, status };
  });
}

/** Voided, never deleted: a gap in the sequence reads as a missing document. */
export async function voidInvoice(
  actor: Actor,
  invoiceId: string,
  reason: string,
): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    invoices,
    { status: "void", voidedAt: new Date(), voidReason: reason, updatedAt: new Date() },
    eq(invoices.id, invoiceId),
    ne(invoices.status, "void"),
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseRow = {
  id: string;
  description: string;
  category: ExpenseCategory;
  spentOn: string;
  amount: Cents;
  taxAmount: Cents;
  supplier: string | null;
  reimbursable: boolean;
  reimbursedAt: Date | null;
  projectId: string | null;
  projectKey: string | null;
  paidByUserId: string | null;
  paidByName: string | null;
};

const EXPENSE_FIELDS = {
  id: expenses.id,
  description: expenses.description,
  category: expenses.category,
  spentOn: expenses.spentOn,
  amount: expenses.amount,
  taxAmount: expenses.taxAmount,
  supplier: expenses.supplier,
  reimbursable: expenses.reimbursable,
  reimbursedAt: expenses.reimbursedAt,
  projectId: expenses.projectId,
  projectKey: projects.key,
  paidByUserId: expenses.paidByUserId,
  paidByName: users.name,
};

const EXPENSE_JOINS = [
  { table: projects, on: eq(projects.id, expenses.projectId), type: "left" as const },
  { table: users, on: eq(users.id, expenses.paidByUserId), type: "left" as const },
];

export async function listExpenses(actor: Actor, from?: string): Promise<ExpenseRow[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    expenses,
    EXPENSE_FIELDS,
    EXPENSE_JOINS,
    from ? gte(expenses.spentOn, from) : undefined,
  );

  return (rows as Array<Record<string, unknown>>)
    .map((row) => ({
      ...(row as unknown as ExpenseRow),
      amount: fromDecimalString(row.amount as string) ?? 0,
      taxAmount: fromDecimalString(row.taxAmount as string) ?? 0,
    }))
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn));
}

export type NewExpenseInput = {
  description: string;
  category: ExpenseCategory;
  spentOn: string;
  amount: Cents;
  taxAmount: Cents;
  supplier: string | null;
  projectId: string | null;
  reimbursable: boolean;
};

export async function createExpense(
  actor: Actor,
  input: NewExpenseInput,
): Promise<{ id: string } | null> {
  const [created] = await withOrg(actor.organizationId).insert(expenses, {
    description: input.description,
    category: input.category,
    spentOn: input.spentOn,
    amount: toDecimalString(input.amount),
    taxAmount: toDecimalString(input.taxAmount),
    supplier: input.supplier,
    projectId: input.projectId,
    // Whoever recorded it is out of pocket unless somebody says otherwise.
    paidByUserId: actor.userId,
    reimbursable: input.reimbursable,
    createdByUserId: actor.userId,
  });

  return created ? { id: created.id } : null;
}

export async function markReimbursed(actor: Actor, expenseId: string): Promise<boolean> {
  const rows = await withOrg(actor.organizationId).update(
    expenses,
    { reimbursedAt: new Date(), updatedAt: new Date() },
    eq(expenses.id, expenseId),
    eq(expenses.reimbursable, true),
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// What needs attention
// ---------------------------------------------------------------------------

export type FinanceSummary = {
  overdue: InvoiceRow[];
  awaiting: InvoiceRow[];
  outstanding: Cents;
  overdueValue: Cents;
  quotesOut: QuoteRow[];
  toReimburse: ExpenseRow[];
};

/**
 * The finance screen's opening question: what needs doing.
 *
 * Every figure is a sum of real documents, and every list is a list of rows
 * somebody can open. No forecast, no run rate, nothing modelled.
 */
export async function financeSummary(actor: Actor, today: string): Promise<FinanceSummary> {
  const [allInvoices, allQuotes, allExpenses] = await Promise.all([
    listInvoices(actor),
    listQuotes(actor),
    listExpenses(actor),
  ]);

  const unpaid = allInvoices.filter(
    (invoice) => invoice.status === "sent" || invoice.status === "part_paid",
  );

  const overdue = unpaid.filter((invoice) => invoice.dueDate < today);
  const awaiting = unpaid.filter((invoice) => invoice.dueDate >= today);

  const owed = (invoice: InvoiceRow) => invoice.total - invoice.paidAmount;

  return {
    overdue: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    awaiting: awaiting.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    outstanding: unpaid.reduce((total, invoice) => total + owed(invoice), 0),
    overdueValue: overdue.reduce((total, invoice) => total + owed(invoice), 0),
    quotesOut: allQuotes.filter((quote) => quote.status === "sent"),
    toReimburse: allExpenses.filter(
      (expense) => expense.reimbursable && expense.reimbursedAt === null,
    ),
  };
}

/** Quotes past their validity, which nobody is going to accept now. */
export async function expireStaleQuotes(actor: Actor, today: string): Promise<number> {
  const rows = await withOrg(actor.organizationId).update(
    quotes,
    { status: "expired", updatedAt: new Date() },
    eq(quotes.status, "sent"),
    lte(quotes.validUntil, today),
  );
  return rows.length;
}
