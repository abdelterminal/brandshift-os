"use server";

import { randomUUID } from "node:crypto";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { requirePermissionForAction } from "@/lib/auth/guards";
import {
  countAttachments,
  deleteAttachmentRow,
  getAttachment,
  getDocumentById,
  recordAttachment,
} from "@/lib/data/documents";
import { recordActivity } from "@/lib/data/activity";
import { refuseUpload, storageKeyFor } from "@/lib/storage/limits";
import { storage } from "@/lib/storage/transport";

/**
 * Attaching a file to a brief, and taking one off.
 *
 * The permission is `brief.edit` rather than `document.edit`: only the people
 * who may change what a brief says may change what it carries, and a signed
 * proposal landing on a client's brief is the same kind of act as editing the
 * terms in it.
 */

export type AttachmentResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Store one file.
 *
 * The order matters and is the opposite of the obvious one. The id is minted
 * here, the bytes are written, and only then is the row inserted -- because
 * the storage key is derived from the id, and because of how the two possible
 * crashes differ. A file with no row is invisible and reclaimable; a row with
 * no file is a download button that fails for as long as anybody keeps it.
 * So the recoverable failure is the one left possible.
 */
export async function uploadAttachment(formData: FormData): Promise<AttachmentResult> {
  const session = await requirePermissionForAction("brief.edit");

  const documentId = String(formData.get("documentId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File)) return { ok: false, error: "invalid" };

  const document = await getDocumentById(session.actor, documentId);
  if (!document) return { ok: false, error: "notFound" };

  // Every limit is decided here, never in the browser. A file input's
  // `accept` is a convenience for the person choosing; it is not a control.
  const refusal = refuseUpload({
    sizeBytes: file.size,
    mimeType: file.type,
    existingCount: await countAttachments(session.actor, documentId),
  });
  if (refusal) return { ok: false, error: refusal };

  const id = randomUUID();
  // From the allowlist, not from the browser: `file.type` was checked against
  // the map above, and the extension comes from the map rather than from the
  // uploaded name, so the two can never disagree.
  const storageKey = storageKeyFor(session.actor.organizationId, id, file.type);
  const bytes = Buffer.from(await file.arrayBuffer());

  await storage().put(storageKey, bytes);

  const created = await recordAttachment(session.actor, {
    id,
    documentId,
    // Trimmed and capped, because it is shown on screen and sent back as the
    // download filename. Never used to build a path -- see `storageKeyFor`.
    fileName: file.name.trim().slice(0, 200) || "file",
    mimeType: file.type,
    sizeBytes: file.size,
    storageKey,
  });

  if (!created) {
    // The row did not land, so the bytes are unreferenced. Remove them rather
    // than leave the volume holding something nothing can reach.
    await storage().remove(storageKey);
    return { ok: false, error: "invalid" };
  }

  await recordActivity(session.actor, {
    verb: "brief.fileAttached",
    subjectType: "document",
    subjectId: documentId,
    projectId: document.projectId,
    metadata: { title: file.name },
  });

  revalidatePath(`/${await getLocale()}`, "layout");
  return { ok: true, id };
}

export async function removeAttachment(attachmentId: string): Promise<AttachmentResult> {
  const session = await requirePermissionForAction("brief.edit");

  const existing = await getAttachment(session.actor, attachmentId);
  if (!existing) return { ok: false, error: "notFound" };

  const document = await getDocumentById(session.actor, existing.documentId);

  // Row first here, for the same reason the upload writes bytes first: if the
  // file is already gone the row must still go, and `remove` is written to
  // tolerate a missing file.
  const removed = await deleteAttachmentRow(session.actor, attachmentId);
  if (!removed) return { ok: false, error: "notFound" };

  await storage().remove(existing.storageKey);

  await recordActivity(session.actor, {
    verb: "brief.fileRemoved",
    subjectType: "document",
    subjectId: existing.documentId,
    projectId: document?.projectId ?? null,
    metadata: { title: existing.fileName },
  });

  revalidatePath(`/${await getLocale()}`, "layout");
  return { ok: true, id: attachmentId };
}
