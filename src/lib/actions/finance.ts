"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  attachQuoteToProject,
  createExpense,
  createInvoice,
  createQuote,
  getInvoice,
  getQuote,
  listQuoteLines,
  markReimbursed,
  recordPayment,
  sendInvoice,
  setQuoteStatus,
  voidInvoice,
  type LineInput,
} from "@/lib/data/finance";
import { parseMoney, parseQuantity } from "@/lib/money";

/**
 * Money in and money out.
 *
 * Every amount arrives from a form as a string and is parsed exactly once,
 * here, into integer cents. Anything that is not an amount is refused with a
 * message that says so -- a field which silently reads "about forty thousand"
 * as zero is a field that loses money quietly.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** A line as a form can express it: three strings and a rate. */
const lineSchema = z.object({
  description: z.string().trim().min(1).max(400),
  quantity: z.string().trim(),
  unitPrice: z.string().trim(),
  taxRateBasisPoints: z.number().int().min(0).max(10_000),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Turn form lines into something the data layer can store.
 *
 * Returns the offending field rather than a boolean: "check the highlighted
 * fields" on a document with fifteen lines is not help.
 */
function parseLines(
  raw: z.infer<typeof lineSchema>[],
): { ok: true; lines: LineInput[] } | { ok: false; error: string } {
  const lines: LineInput[] = [];

  for (const line of raw) {
    const quantity = parseQuantity(line.quantity);
    if (quantity === null) return { ok: false, error: "quantity" };

    const unitPrice = parseMoney(line.unitPrice);
    if (unitPrice === null) return { ok: false, error: "money" };

    lines.push({
      description: line.description,
      quantityThousandths: quantity,
      unitPrice,
      taxRateBasisPoints: line.taxRateBasisPoints,
    });
  }

  if (lines.length === 0) return { ok: false, error: "noLines" };
  return { ok: true, lines };
}

async function revalidateFinance() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

const quoteSchema = z.object({
  companyId: z.uuid(),
  dealId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  issueDate: dateSchema,
  validUntil: z.union([dateSchema, z.literal("")]).optional(),
  terms: z.string().trim().max(4000).optional(),
  lines: z.array(lineSchema).min(1).max(100),
});

export async function addQuote(input: z.input<typeof quoteSchema>): Promise<ActionResult> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const lines = parseLines(parsed.data.lines);
  if (!lines.ok) return { ok: false, error: lines.error };

  const session = await requirePermissionForAction("finance.manage");

  const created = await createQuote(session.actor, {
    companyId: parsed.data.companyId,
    dealId: parsed.data.dealId ?? null,
    title: parsed.data.title,
    issueDate: parsed.data.issueDate,
    validUntil: parsed.data.validUntil || null,
    terms: parsed.data.terms || null,
    lines: lines.lines,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "quote.created",
    subjectType: "quote",
    subjectId: created.id,
    metadata: { number: created.number, title: parsed.data.title },
  });

  const locale = await getLocale();
  await revalidateFinance();
  redirect(`/${locale}/finance/quotes/${created.id}`);
}

const quoteStatusSchema = z.object({
  quoteId: z.uuid(),
  status: z.enum(["sent", "accepted", "declined", "expired"]),
  declineReason: z.string().trim().max(2000).optional(),
});

export async function moveQuote(input: z.input<typeof quoteStatusSchema>): Promise<ActionResult> {
  const parsed = quoteStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  if (parsed.data.status === "declined" && !parsed.data.declineReason) {
    return { ok: false, error: "reasonRequired" };
  }

  const session = await requirePermissionForAction("finance.manage");
  const quote = await getQuote(session.actor, parsed.data.quoteId);
  if (!quote) return { ok: false, error: "notFound" };

  const moved = await setQuoteStatus(
    session.actor,
    parsed.data.quoteId,
    parsed.data.status,
    parsed.data.declineReason ?? null,
  );
  if (!moved) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: `quote.${parsed.data.status}`,
    subjectType: "quote",
    subjectId: parsed.data.quoteId,
    metadata: {
      number: quote.number,
      title: quote.title,
      ownerUserId: quote.ownerUserId,
    },
  });

  await revalidateFinance();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const invoiceSchema = z.object({
  companyId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  quoteId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  issueDate: dateSchema,
  dueDate: dateSchema,
  terms: z.string().trim().max(4000).optional(),
  lines: z.array(lineSchema).min(1).max(100),
});

export async function addInvoice(input: z.input<typeof invoiceSchema>): Promise<ActionResult> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // An invoice due before it is issued is a typo, and one nobody would notice
  // until it appeared on the overdue list the day it was written.
  if (parsed.data.dueDate < parsed.data.issueDate) return { ok: false, error: "dueBeforeIssue" };

  const lines = parseLines(parsed.data.lines);
  if (!lines.ok) return { ok: false, error: lines.error };

  const session = await requirePermissionForAction("finance.manage");

  const created = await createInvoice(session.actor, {
    companyId: parsed.data.companyId,
    projectId: parsed.data.projectId ?? null,
    quoteId: parsed.data.quoteId ?? null,
    title: parsed.data.title,
    issueDate: parsed.data.issueDate,
    dueDate: parsed.data.dueDate,
    terms: parsed.data.terms || null,
    lines: lines.lines,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "invoice.created",
    subjectType: "invoice",
    subjectId: created.id,
    metadata: { number: created.number, title: parsed.data.title },
  });

  const locale = await getLocale();
  await revalidateFinance();
  redirect(`/${locale}/finance/invoices/${created.id}`);
}

export async function issueInvoice(invoiceId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(invoiceId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("finance.manage");
  const invoice = await getInvoice(session.actor, id.data);
  if (!invoice) return { ok: false, error: "notFound" };

  const sent = await sendInvoice(session.actor, id.data);
  if (!sent) return { ok: false, error: "alreadySent" };

  await recordActivity(session.actor, {
    verb: "invoice.sent",
    subjectType: "invoice",
    subjectId: id.data,
    metadata: { number: invoice.number, title: invoice.title },
  });

  await revalidateFinance();
  return { ok: true };
}

const paymentSchema = z.object({ invoiceId: z.uuid(), amount: z.string().trim() });

/**
 * Record money arriving.
 *
 * The amount is what somebody types off a bank statement, so it is parsed the
 * same way every other figure is, and a part payment is a first-class outcome
 * rather than a checkbox somebody forgets.
 */
export async function addPayment(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "money" };

  const session = await requirePermissionForAction("finance.manage");
  const invoice = await getInvoice(session.actor, parsed.data.invoiceId);
  if (!invoice) return { ok: false, error: "notFound" };

  const result = await recordPayment(session.actor, parsed.data.invoiceId, amount);
  if (!result) return { ok: false, error: "notSent" };

  await recordActivity(session.actor, {
    verb: result.status === "paid" ? "invoice.paid" : "invoice.partPaid",
    subjectType: "invoice",
    subjectId: parsed.data.invoiceId,
    metadata: { number: invoice.number, title: invoice.title },
  });

  await revalidateFinance();
  return { ok: true };
}

const voidSchema = z.object({ invoiceId: z.uuid(), reason: z.string().trim().min(1).max(2000) });

export async function cancelInvoice(input: z.input<typeof voidSchema>): Promise<ActionResult> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "reasonRequired" };

  const session = await requirePermissionForAction("finance.manage");
  const invoice = await getInvoice(session.actor, parsed.data.invoiceId);
  if (!invoice) return { ok: false, error: "notFound" };

  const voided = await voidInvoice(session.actor, parsed.data.invoiceId, parsed.data.reason);
  if (!voided) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: "invoice.voided",
    subjectType: "invoice",
    subjectId: parsed.data.invoiceId,
    metadata: { number: invoice.number, title: invoice.title },
  });

  await revalidateFinance();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const expenseSchema = z.object({
  description: z.string().trim().min(1).max(300),
  category: z.enum(["subcontractor", "software", "travel", "equipment", "production", "other"]),
  spentOn: dateSchema,
  amount: z.string().trim(),
  taxAmount: z.string().trim().optional(),
  supplier: z.string().trim().max(200).optional(),
  projectId: z.uuid().nullable().optional(),
  reimbursable: z.boolean().optional(),
});

export async function addExpense(input: z.input<typeof expenseSchema>): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const amount = parseMoney(parsed.data.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "money" };

  const taxAmount = parsed.data.taxAmount ? parseMoney(parsed.data.taxAmount) : 0;
  if (taxAmount === null) return { ok: false, error: "money" };

  const session = await requirePermissionForAction("finance.manage");

  const created = await createExpense(session.actor, {
    description: parsed.data.description,
    category: parsed.data.category,
    spentOn: parsed.data.spentOn,
    amount,
    taxAmount,
    supplier: parsed.data.supplier || null,
    projectId: parsed.data.projectId ?? null,
    reimbursable: parsed.data.reimbursable === true,
  });
  if (!created) return { ok: false, error: "invalid" };

  await revalidateFinance();
  return { ok: true, id: created.id };
}

export async function reimburseExpense(expenseId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(expenseId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("finance.manage");
  const done = await markReimbursed(session.actor, id.data);
  if (!done) return { ok: false, error: "notFound" };

  await revalidateFinance();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The handover
// ---------------------------------------------------------------------------

/**
 * Turn an accepted quote into the work it pays for.
 *
 * The gap `KNOWN-GAPS.md` recorded when CRM landed: selling something and then
 * doing it were two disconnected halves, and the join between them was
 * retyping. Each quote line becomes a task, because the lines are what was
 * agreed and therefore what has to be delivered.
 */
const handoverSchema = z.object({
  quoteId: z.uuid(),
  key: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,5}$/),
  name: z.string().trim().min(2).max(160),
});

export async function quoteToProject(input: z.input<typeof handoverSchema>): Promise<ActionResult> {
  const parsed = handoverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("finance.manage");
  await requirePermissionForAction("project.create");

  const quote = await getQuote(session.actor, parsed.data.quoteId);
  if (!quote) return { ok: false, error: "notFound" };
  if (quote.status !== "accepted") return { ok: false, error: "notAccepted" };
  if (quote.projectId) return { ok: false, error: "alreadyConverted" };

  const lines = await listQuoteLines(session.actor, quote.id);

  const { createProjectFromQuote } = await import("@/lib/data/projects");
  const project = await createProjectFromQuote(session.actor, {
    key: parsed.data.key.toUpperCase(),
    name: parsed.data.name,
    description: quote.title,
    deliverables: lines.map((line) => line.description),
  });
  if (!project) return { ok: false, error: "keyTaken" };

  await attachQuoteToProject(session.actor, quote.id, project.id);

  await recordActivity(session.actor, {
    verb: "project.created",
    subjectType: "project",
    subjectId: project.id,
    projectId: project.id,
    metadata: { name: parsed.data.name, key: project.key, fromQuote: quote.number },
  });

  const locale = await getLocale();
  await revalidateFinance();
  redirect(`/${locale}/work/${project.key}`);
}
