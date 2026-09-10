import "server-only";

import { eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { departments, documentSections, documents, projects, users } from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import { slugify } from "@/lib/slug";
import { isUuid } from "@/lib/uuid";

/**
 * Reading and writing documents.
 *
 * The same section-as-a-row shape as `sops.ts`, without the review cadence: a
 * brief is not a procedure that goes stale on a timer, it is a thing that is
 * true for one client until the work says otherwise. So there is a `kind` and
 * an optional `projectId` instead of an interval and a last-reviewed date.
 */

export { type DocumentKind } from "./document-kinds";
import type { DocumentKind } from "./document-kinds";

export type DocumentSectionView = {
  id: string;
  title: string;
  detail: string | null;
  position: number;
};

export type DocumentView = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: DocumentKind;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sections: DocumentSectionView[];
};

const DOCUMENT_FIELDS = {
  id: documents.id,
  slug: documents.slug,
  title: documents.title,
  summary: documents.summary,
  kind: documents.kind,
  projectId: documents.projectId,
  projectKey: projects.key,
  projectName: projects.name,
  departmentId: documents.departmentId,
  departmentName: departments.name,
  ownerUserId: documents.ownerUserId,
  ownerName: users.name,
  archivedAt: documents.archivedAt,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

const DOCUMENT_JOINS = [
  { table: projects, on: eq(documents.projectId, projects.id), type: "left" as const },
  { table: departments, on: eq(documents.departmentId, departments.id), type: "left" as const },
  { table: users, on: eq(documents.ownerUserId, users.id), type: "left" as const },
];

const KIND_ORDER: Record<DocumentKind, number> = {
  playbook: 0,
  reference: 1,
  brief: 2,
  marketing_system: 3,
  pre_production: 4,
  case_study: 5,
  note: 6,
};

type DocumentFieldRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  kind: DocumentKind;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function decorate(
  actor: Actor,
  rows: DocumentFieldRow[],
  withSections: boolean,
): Promise<DocumentView[]> {
  if (rows.length === 0) return [];

  const sections = withSections
    ? await withOrg(actor.organizationId).select(
        documentSections,
        inArray(
          documentSections.documentId,
          rows.map((row) => row.id),
        ),
      )
    : [];

  return rows
    .map((row) => ({
      ...row,
      sections: sections
        .filter((section) => section.documentId === row.id)
        .sort((a, b) => a.position - b.position)
        .map((section) => ({
          id: section.id,
          title: section.title,
          detail: section.detail,
          position: section.position,
        })),
    }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.title.localeCompare(b.title),
    );
}

/** Organization-level documents -- the ones not tied to a project. */
export async function listDocuments(actor: Actor): Promise<DocumentView[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    documents,
    DOCUMENT_FIELDS,
    DOCUMENT_JOINS,
    isNull(documents.projectId),
    isNull(documents.archivedAt),
  )) as DocumentFieldRow[];

  return decorate(actor, rows, false);
}

/** The documents that hang off one project, for its Docs tab. */
export async function listProjectDocuments(
  actor: Actor,
  projectId: string,
): Promise<DocumentView[]> {
  if (!isUuid(projectId)) return [];

  const rows = (await withOrg(actor.organizationId).selectJoined(
    documents,
    DOCUMENT_FIELDS,
    DOCUMENT_JOINS,
    eq(documents.projectId, projectId),
    isNull(documents.archivedAt),
  )) as DocumentFieldRow[];

  return decorate(actor, rows, false);
}

export async function getDocument(actor: Actor, slug: string): Promise<DocumentView | null> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    documents,
    DOCUMENT_FIELDS,
    DOCUMENT_JOINS,
    eq(documents.slug, slug),
  )) as DocumentFieldRow[];

  const [view] = await decorate(actor, rows, true);
  return view ?? null;
}

export async function getDocumentById(actor: Actor, documentId: string) {
  if (!isUuid(documentId)) return null;
  const [row] = await withOrg(actor.organizationId).select(
    documents,
    eq(documents.id, documentId),
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type SectionInput = { title: string; detail: string | null };

async function uniqueSlug(actor: Actor, title: string): Promise<string> {
  const base = slugify(title, "document");
  const existing = await withOrg(actor.organizationId).selectFields(documents, {
    slug: documents.slug,
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free slug for "${title}"`);
}

export async function createDocument(
  actor: Actor,
  input: {
    title: string;
    summary: string | null;
    kind: DocumentKind;
    projectId: string | null;
    departmentId: string | null;
    sections: SectionInput[];
  },
): Promise<{ id: string; slug: string } | null> {
  const slug = await uniqueSlug(actor, input.title);

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [created] = await scope.insert(documents, {
      slug,
      title: input.title,
      summary: input.summary,
      kind: input.kind,
      projectId: input.projectId,
      departmentId: input.departmentId,
      ownerUserId: actor.userId,
      createdByUserId: actor.userId,
    });
    if (!created) return null;

    if (input.sections.length > 0) {
      await scope.insert(
        documentSections,
        input.sections.map((section, index) => ({
          documentId: created.id,
          position: index,
          title: section.title,
          detail: section.detail,
        })),
      );
    }

    return { id: created.id, slug: created.slug };
  });
}

export async function updateDocument(
  actor: Actor,
  documentId: string,
  input: { title: string; summary: string | null; kind: DocumentKind },
): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    documents,
    {
      title: input.title,
      summary: input.summary,
      kind: input.kind,
      updatedAt: new Date(),
    },
    eq(documents.id, documentId),
  );
  return updated.length > 0;
}

/** Replace the sections wholesale -- the `replaceSteps` pattern from `sops.ts`. */
export async function replaceDocumentSections(
  actor: Actor,
  documentId: string,
  sections: SectionInput[],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [doc] = await scope.select(documents, eq(documents.id, documentId));
    if (!doc) return false;

    await scope.delete(documentSections, eq(documentSections.documentId, documentId));

    if (sections.length > 0) {
      await scope.insert(
        documentSections,
        sections.map((section, index) => ({
          documentId,
          position: index,
          title: section.title,
          detail: section.detail,
        })),
      );
    }

    await scope.update(documents, { updatedAt: new Date() }, eq(documents.id, documentId));
    return true;
  });
}

export async function setDocumentArchived(
  actor: Actor,
  documentId: string,
  archived: boolean,
): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    documents,
    { archivedAt: archived ? new Date() : null, updatedAt: new Date() },
    eq(documents.id, documentId),
    // Only archive a live one / restore an archived one -- a no-op returns nothing.
    archived ? isNull(documents.archivedAt) : undefined,
  );
  return updated.length > 0;
}
