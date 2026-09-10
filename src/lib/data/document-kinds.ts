/**
 * The document-kind vocabulary.
 *
 * Split from `documents.ts` for the same reason `pipeline-stages.ts` is split
 * from `pipeline.ts`: the document editor is a Client Component and cannot pull
 * in a `server-only` module just to know the list of kinds.
 */

export const DOCUMENT_KINDS = [
  "brief",
  "marketing_system",
  "pre_production",
  "case_study",
  "playbook",
  "reference",
  "note",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
