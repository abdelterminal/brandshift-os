import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { companies, deals } from "./crm";
import { expenseCategoryEnum, invoiceStatusEnum, quoteStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./people";
import { projects } from "./projects";

/**
 * Quotes, invoices and expenses.
 *
 * Every amount is `numeric` and exact. Nothing here is ever a float -- see
 * `src/lib/money.ts`, which does all the arithmetic in integer cents and is
 * the most heavily tested file in the codebase for that reason.
 *
 * **Totals are stored, not derived**, and this is the opposite of the call
 * made for leave balances on purpose. A balance is a fact about the present
 * and should be recomputed. An invoice is a *document*: once it has been sent,
 * what it said is what it said, and a total that silently follows a later edit
 * to a line is a document that disagrees with the copy the client is holding.
 * Totals are recalculated on every change while a document is a draft, and
 * frozen the moment it leaves the building.
 */

/**
 * A priced proposal.
 *
 * `accepted` is the end of it. There is deliberately no separate "order"
 * table: for an agency the confirmed engagement is an accepted quote plus the
 * project the work becomes, and a third entity between the two would be a
 * table nobody fills in.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `Q-2026-0001`. Unique per organization, and never reused. */
    number: text("number").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    /** The deal this was quoted for, when it came from one. */
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    /** Set when an accepted quote becomes work. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: quoteStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull(),
    validUntil: date("valid_until"),
    /** What the client reads under the numbers. */
    terms: text("terms"),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quotes_org_number_key").on(t.organizationId, t.number),
    index("quotes_org_status_idx").on(t.organizationId, t.status),
    index("quotes_company_idx").on(t.companyId),
  ],
);

/**
 * One line of a quote.
 *
 * Quantity is thousandths and the unit price is exact, because agencies bill
 * in fractions of a day and `0.125` is a real number of them. Tax is basis
 * points -- 20% is `2000`, and 5.5% is `550` with no decimal anywhere in the
 * arithmetic.
 *
 * `lineTotal` is stored for the same reason the document totals are: it is
 * what the printed document said.
 */
export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    /**
     * What the line actually covers, one bullet per line -- the same
     * newline-separated convention `terms` uses.
     *
     * Two columns rather than one with a marker character. An exclusion reads
     * differently on the page (muted, and last), so it is a different kind of
     * thing, not a flag on a bullet; and any in-band marker -- a leading `-`
     * being the obvious candidate -- is exactly what somebody typing a
     * markdown list would produce by accident.
     */
    details: text("details"),
    /** What it explicitly does not cover. Printed muted, after `details`. */
    exclusions: text("exclusions"),
    quantityThousandths: integer("quantity_thousandths").notNull().default(1000),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId, t.position)],
);

/**
 * Money billed.
 *
 * A sent invoice is never edited and never deleted -- it is voided, which
 * keeps the number and the record. Deleting one would leave a hole in a
 * sequence that an auditor reads as a missing document.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `INV-2026-0001`. Unique per organization, and never reused. */
    number: text("number").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    terms: text("terms"),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    /** What has actually arrived. Part payments are real. */
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_key").on(t.organizationId, t.number),
    index("invoices_org_status_idx").on(t.organizationId, t.status),
    // "What is overdue" is this index.
    index("invoices_org_due_idx").on(t.organizationId, t.dueDate),
    index("invoices_company_idx").on(t.companyId),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    /** As `quoteLines.details`. */
    details: text("details"),
    /** As `quoteLines.exclusions`. */
    exclusions: text("exclusions"),
    quantityThousandths: integer("quantity_thousandths").notNull().default(1000),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId, t.position)],
);

/**
 * Money spent.
 *
 * Deliberately flat: one amount, one date, one category. An expense is a
 * receipt somebody is holding, not a document with lines, and giving it the
 * shape of an invoice would make recording lunch a five-field exercise.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    category: expenseCategoryEnum("category").notNull().default("other"),
    spentOn: date("spent_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Who it is for, when it belongs to a piece of work. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    supplier: text("supplier"),
    /** Who is out of pocket. */
    paidByUserId: uuid("paid_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Whether the person who paid gets it back. */
    reimbursable: boolean("reimbursable").notNull().default(false),
    reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_org_spent_idx").on(t.organizationId, t.spentOn),
    index("expenses_project_idx").on(t.projectId),
    index("expenses_paid_by_idx").on(t.paidByUserId),
  ],
);

export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategoryEnum.enumValues)[number];
