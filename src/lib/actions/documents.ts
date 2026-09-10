"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  createDocument,
  getDocumentById,
  replaceDocumentSections,
  setDocumentArchived,
  updateDocument,
  type SectionInput,
} from "@/lib/data/documents";

/**
 * Writing the prose a project runs on.
 *
 * The same shape as the procedure actions -- sections are replaced wholesale,
 * the Zod bounds match the SOP editor's -- minus the review ritual. A brief
 * does not go stale on a timer.
 */

export type ActionResult = { ok: true; slug?: string } | { ok: false; error: string };

const KINDS = [
  "brief",
  "marketing_system",
  "pre_production",
  "case_study",
  "playbook",
  "reference",
  "note",
] as const;

const sectionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000).optional(),
});

function toSections(raw: z.infer<typeof sectionSchema>[]): SectionInput[] {
  return raw.map((section) => ({ title: section.title, detail: section.detail || null }));
}

async function revalidateDocuments() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  kind: z.enum(KINDS),
  projectId: z.union([z.uuid(), z.literal("")]).optional(),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  sections: z.array(sectionSchema).min(1).max(50),
});

export async function createDocumentAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("document.create");

  const created = await createDocument(session.actor, {
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    kind: parsed.data.kind,
    projectId: parsed.data.projectId || null,
    departmentId: parsed.data.departmentId || null,
    sections: toSections(parsed.data.sections),
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "document.created",
    subjectType: "document",
    subjectId: created.id,
    projectId: parsed.data.projectId || null,
    metadata: { title: parsed.data.title, kind: parsed.data.kind },
  });

  const locale = await getLocale();
  await revalidateDocuments();
  redirect(`/${locale}/documents/${created.slug}`);
}

const updateSchema = z.object({
  documentId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  kind: z.enum(KINDS),
  sections: z.array(sectionSchema).min(1).max(50),
});

export async function updateDocumentAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("document.edit");

  const existing = await getDocumentById(session.actor, parsed.data.documentId);
  if (!existing) return { ok: false, error: "notFound" };

  const metaOk = await updateDocument(session.actor, parsed.data.documentId, {
    title: parsed.data.title,
    summary: parsed.data.summary || null,
    kind: parsed.data.kind,
  });
  const sectionsOk = await replaceDocumentSections(
    session.actor,
    parsed.data.documentId,
    toSections(parsed.data.sections),
  );
  if (!metaOk || !sectionsOk) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "document.updated",
    subjectType: "document",
    subjectId: parsed.data.documentId,
    projectId: existing.projectId,
    metadata: { title: parsed.data.title },
  });

  await revalidateDocuments();
  return { ok: true };
}

const archiveSchema = z.object({ documentId: z.uuid(), archived: z.boolean() });

export async function archiveDocumentAction(
  input: z.input<typeof archiveSchema>,
): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("document.archive");

  const existing = await getDocumentById(session.actor, parsed.data.documentId);
  if (!existing) return { ok: false, error: "notFound" };

  const done = await setDocumentArchived(
    session.actor,
    parsed.data.documentId,
    parsed.data.archived,
  );
  if (!done) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: parsed.data.archived ? "document.archived" : "document.restored",
    subjectType: "document",
    subjectId: parsed.data.documentId,
    projectId: existing.projectId,
    metadata: { title: existing.title },
  });

  await revalidateDocuments();
  return { ok: true };
}
