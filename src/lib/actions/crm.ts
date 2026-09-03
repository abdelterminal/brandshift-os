"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  createCompany,
  createContact,
  createDeal,
  getDeal,
  moveDealToStage,
  updateCompanyNotes,
  updateDeal,
} from "@/lib/data/crm";

/**
 * CRM mutations.
 *
 * All gated by `crm.manage`, which is the same module flag as `crm.view`:
 * a CRM where reading and writing are separate permissions is one where the
 * person who took the call cannot record what was said, and the note ends up
 * in their own notebook instead.
 *
 * Money arrives as a string from the form and is parsed once, here. Everything
 * downstream of this file deals in numbers, and the column stores an exact
 * decimal -- a float that has been through a sum is a rounding error waiting
 * for an invoice.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * A figure somebody typed.
 *
 * Accepts what people actually type -- `12 000`, `12,000`, `12000.50` -- and
 * refuses anything else rather than silently storing a zero. Spaces and commas
 * are thousands separators in the two locales this app ships.
 */
const moneySchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s,]/g, ""))
  .refine((raw) => raw === "" || /^\d+(\.\d{1,2})?$/.test(raw), { message: "money" })
  .transform((raw) => (raw === "" ? null : Number(raw)));

const dateSchema = z
  .string()
  .trim()
  .refine((raw) => raw === "" || /^\d{4}-\d{2}-\d{2}$/.test(raw), { message: "date" })
  .transform((raw) => (raw === "" ? null : raw));

async function revalidateCrm() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

const companySchema = z.object({
  name: z.string().trim().min(1).max(160),
  website: z.string().trim().max(400).optional(),
  industry: z.string().trim().max(120).optional(),
  status: z.enum(["prospect", "client", "former"]),
  ownerUserId: z.uuid().nullable().optional(),
});

export async function addCompany(input: z.input<typeof companySchema>): Promise<ActionResult> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("crm.manage");

  const created = await createCompany(session.actor, {
    name: parsed.data.name,
    website: parsed.data.website || null,
    industry: parsed.data.industry || null,
    status: parsed.data.status,
    ownerUserId: parsed.data.ownerUserId ?? session.actor.userId,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "company.created",
    subjectType: "company",
    subjectId: created.id,
    metadata: { name: parsed.data.name },
  });

  const locale = await getLocale();
  await revalidateCrm();
  redirect(`/${locale}/crm/companies/${created.slug}`);
}

export async function saveCompanyNotes(companyId: string, notes: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(companyId);
  const text = z.string().max(8000).safeParse(notes);
  if (!id.success || !text.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("crm.manage");
  const saved = await updateCompanyNotes(session.actor, id.data, text.data.trim());
  if (!saved) return { ok: false, error: "notFound" };

  await revalidateCrm();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().trim().max(60).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  companyId: z.uuid().nullable().optional(),
});

export async function addContact(input: z.input<typeof contactSchema>): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("crm.manage");

  const created = await createContact(session.actor, {
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    jobTitle: parsed.data.jobTitle || null,
    companyId: parsed.data.companyId ?? null,
  });
  if (!created) return { ok: false, error: "invalid" };

  await revalidateCrm();
  return { ok: true, id: created.id };
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

const dealSchema = z.object({
  title: z.string().trim().min(1).max(200),
  companyId: z.uuid(),
  primaryContactId: z.uuid().nullable().optional(),
  value: moneySchema.optional(),
  expectedCloseDate: dateSchema.optional(),
  source: z.string().trim().max(160).optional(),
  ownerUserId: z.uuid().nullable().optional(),
});

export async function addDeal(input: z.input<typeof dealSchema>): Promise<ActionResult> {
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) {
    // The one input worth naming: a figure somebody typed and got wrong is a
    // different problem from a missing title, and "check the fields" would not
    // tell them which.
    const money = parsed.error.issues.some((issue) => issue.message === "money");
    return { ok: false, error: money ? "money" : "invalid" };
  }

  const session = await requirePermissionForAction("crm.manage");

  const created = await createDeal(session.actor, {
    title: parsed.data.title,
    companyId: parsed.data.companyId,
    primaryContactId: parsed.data.primaryContactId ?? null,
    value: parsed.data.value ?? null,
    expectedCloseDate: parsed.data.expectedCloseDate ?? null,
    source: parsed.data.source || null,
    ownerUserId: parsed.data.ownerUserId ?? session.actor.userId,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "deal.created",
    subjectType: "deal",
    subjectId: created.id,
    metadata: { title: parsed.data.title },
  });

  const locale = await getLocale();
  await revalidateCrm();
  redirect(`/${locale}/crm/deals/${created.id}`);
}

const stageSchema = z.object({
  dealId: z.uuid(),
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]),
  lostReason: z.string().trim().max(2000).optional(),
});

/**
 * Move a deal along the pipeline.
 *
 * Losing one asks for a reason. A pipeline with no reasons on the lost deals
 * is a pipeline that teaches nobody anything, which is most of what it is for
 * once the quarter is over.
 */
export async function moveDeal(input: z.input<typeof stageSchema>): Promise<ActionResult> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  if (parsed.data.stage === "lost" && !parsed.data.lostReason) {
    return { ok: false, error: "reasonRequired" };
  }

  const session = await requirePermissionForAction("crm.manage");

  const deal = await getDeal(session.actor, parsed.data.dealId);
  if (!deal) return { ok: false, error: "notFound" };
  if (deal.stage === parsed.data.stage) return { ok: false, error: "alreadyThere" };

  const moved = await moveDealToStage(
    session.actor,
    parsed.data.dealId,
    parsed.data.stage,
    parsed.data.lostReason ?? null,
  );
  if (!moved) return { ok: false, error: "notFound" };

  const verb =
    parsed.data.stage === "won"
      ? "deal.won"
      : parsed.data.stage === "lost"
        ? "deal.lost"
        : "deal.stageChanged";

  await recordActivity(session.actor, {
    verb,
    subjectType: "deal",
    subjectId: parsed.data.dealId,
    metadata: {
      title: deal.title,
      ownerUserId: deal.ownerUserId,
      from: deal.stage,
      to: parsed.data.stage,
    },
  });

  await revalidateCrm();
  return { ok: true };
}

const editSchema = z.object({
  dealId: z.uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  value: moneySchema.optional(),
  expectedCloseDate: dateSchema.optional(),
  primaryContactId: z.uuid().nullable().optional(),
  ownerUserId: z.uuid().nullable().optional(),
  source: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(8000).optional(),
});

export async function editDeal(input: z.input<typeof editSchema>): Promise<ActionResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const money = parsed.error.issues.some((issue) => issue.message === "money");
    return { ok: false, error: money ? "money" : "invalid" };
  }

  const session = await requirePermissionForAction("crm.manage");
  const { dealId, ...patch } = parsed.data;

  const saved = await updateDeal(session.actor, dealId, patch);
  if (!saved) return { ok: false, error: "notFound" };

  await revalidateCrm();
  return { ok: true };
}
