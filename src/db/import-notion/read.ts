import { readFileSync } from "node:fs";

import {
  asArray,
  asObject,
  plainText,
  sectionsFromBlocks,
  stripLeadingNumber,
  type Json,
  type Section,
} from "./blocks";

/**
 * The Notion export, translated -- reading half.
 *
 * The source is a full Notion API dump of the retired "Mediast OS" workspace
 * (`Mediast_OS_API_Raw_Export.json`): `{ pages, blocks_by_page, databases,
 * data_sources, users }`. Notion is going away, so this is a one-shot -- there
 * is no sync, and everything worth keeping comes across once.
 *
 * What it pulls:
 *  - the **SOP Library** (12) -> procedures, as before
 *  - the **Projects** database (22) -> project skeletons
 *  - the **Tasks** database (39) -> tasks under those projects
 *  - the **Team** database (7) -> a responsibilities line per member
 *  - a handful of free-standing pages (the Mr Dyaf dossier, the HQ/wiki
 *    pages, the templates) -> documents
 *
 * Everything is pure. The rule, as in the Mongo migration: translate, never
 * invent. A field with no home is reported by `run.ts`, not guessed at.
 */

export const SOP_DATABASE_TITLE = "SOP Library — Mediast Creative";
export const EXPECTED_SOP_SECTIONS = 12;

// The free-standing pages worth keeping, by id, with the kind and (for the Mr
// Dyaf dossier) the project name they attach to. Explicit because it is a
// one-shot: there are ten of them and a rule that caught exactly these would
// be longer than the list.
const DOCUMENT_PAGES: Record<
  string,
  { kind: string; projectName?: string }
> = {
  "3cfb57af-bb28-81c7-98f3-c5fbde240ad4": { kind: "brief", projectName: "Mr Dyaf" },
  "3d3b57af-bb28-81a6-8455-e4be7e024c48": { kind: "marketing_system", projectName: "Mr Dyaf" },
  "3ceb57af-bb28-81f7-8ab9-c9b573dcd072": { kind: "pre_production", projectName: "Mr Dyaf" },
  "3ccb57af-bb28-8127-9d2f-e6e3ee6520c8": { kind: "reference" }, // Weekly Review
  "3d3b57af-bb28-813d-a934-ffbe004087e9": { kind: "reference" }, // Zayneb Marketing HQ
  "3ccb57af-bb28-811b-9571-fbf0e7bde640": { kind: "playbook" }, // SOP — Master Template
  "3ccb57af-bb28-81b6-a934-de535d8d2fcf": { kind: "playbook" }, // New Client Onboarding
  "3ccb57af-bb28-81e5-9589-e3c3cef1bc1b": { kind: "reference" }, // Mediast HQ
  "3ccb57af-bb28-81c9-bd08-c5471720a9de": { kind: "reference" }, // Mediast OS (root hub)
};

/** Notion SOP name -> the delivery-flow stage it is the procedure for. */
const SOP_STAGE: Record<string, string> = {
  "Client Onboarding": "onboarding",
  "Client Brief": "onboarding",
  "Marketing Strategy": "strategy",
  "Content Planning": "planning",
  "Pre-Production & Shooting": "production",
  "Content Production": "production",
  "Post-Production": "production",
  "Internal Quality Check": "review",
  "Client Validation & Corrections": "client_validation",
  "Publishing": "publishing",
  "Weekly Project Review": "reporting",
  "Monthly Reporting": "reporting",
};

const NOTION_PROJECT_STATUS: Record<string, string> = {
  "In Progress": "active",
  "On Hold": "on_hold",
  Completed: "completed",
  Done: "completed",
};

const NOTION_TASK_STATUS: Record<string, string> = {
  "In Progress": "in_progress",
  Review: "in_progress",
  Done: "done",
  Blocked: "blocked",
};

const NOTION_PRIORITY: Record<string, string> = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Urgent: "urgent",
};

export type SopSource = {
  notionId: string;
  title: string;
  objective: string;
  sections: Section[];
  stage: string | null;
};

export type ProjectSource = {
  notionId: string;
  name: string;
  status: string;
  objective: string | null;
};

export type TaskSource = {
  notionId: string;
  title: string;
  projectNotionId: string | null;
  /** The Team page the Notion "Responsable" relation points at, if any. */
  responsableNotionId: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  done: boolean;
};

export type TeamSource = {
  notionId: string;
  name: string;
  role: string;
  responsibilities: string;
};

export type DocumentSource = {
  notionId: string;
  title: string;
  kind: string;
  projectName: string | null;
  summary: string | null;
  sections: Section[];
};

export type NotionSource = {
  sops: SopSource[];
  projects: ProjectSource[];
  tasks: TaskSource[];
  team: TeamSource[];
  documents: DocumentSource[];
};

function titleOf(page: Json): string {
  const properties = asObject(page.properties);
  for (const value of Object.values(properties)) {
    const property = asObject(value);
    if (property.type === "title") return plainText(property.title);
  }
  return "";
}

function selectName(property: unknown): string {
  const select = asObject(asObject(property).select);
  return typeof select.name === "string" ? select.name : "";
}

function richTextOf(property: unknown): string {
  return plainText(asObject(property).rich_text);
}

function dateStart(property: unknown): string | null {
  const date = asObject(asObject(property).date);
  return typeof date.start === "string" ? date.start.slice(0, 10) : null;
}

function firstRelationId(property: unknown): string | null {
  const first = asArray(asObject(property).relation)[0];
  const id = asObject(first).id;
  return typeof id === "string" ? id : null;
}

function findDataSourceId(root: Json, databaseTitle: string): string | null {
  const databases = asObject(root.databases);
  const dataSources = asObject(root.data_sources);

  const dbId = Object.entries(databases).find(
    ([, value]) => plainText(asObject(value).title) === databaseTitle,
  )?.[0];
  if (!dbId) return null;

  return (
    Object.entries(dataSources).find(([, value]) => asObject(value).database_id === dbId)?.[0] ??
    null
  );
}

function rowsOf(root: Json, databaseTitle: string): Json[] {
  const dsId = findDataSourceId(root, databaseTitle);
  if (!dsId) return [];
  return asArray(asObject(asObject(root.data_sources)[dsId]).rows).map(asObject);
}

export function readNotionExport(filePath: string): NotionSource {
  let root: Json;
  try {
    root = asObject(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new Error(
      `Could not read the export at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const blocksByPage = asObject(root.blocks_by_page);
  const blocksFor = (pageId: string) => asArray(blocksByPage[pageId]).map(asObject);

  // -- SOPs --------------------------------------------------------------
  if (!findDataSourceId(root, SOP_DATABASE_TITLE)) {
    throw new Error(`No "${SOP_DATABASE_TITLE}" database in the export. Is this the right file?`);
  }
  const sops: SopSource[] = rowsOf(root, SOP_DATABASE_TITLE).map((page) => {
    const notionId = String(page.id ?? "");
    const title = titleOf(page);
    const sections = sectionsFromBlocks(blocksFor(notionId), title);
    return {
      notionId,
      title,
      objective: sections[0]?.body ?? "",
      sections,
      stage: SOP_STAGE[title] ?? null,
    };
  });

  // -- Projects --------------------------------------------------------
  const projects: ProjectSource[] = rowsOf(root, "Projects").map((page) => {
    const properties = asObject(page.properties);
    return {
      notionId: String(page.id ?? ""),
      name: titleOf(page),
      status: NOTION_PROJECT_STATUS[selectName(properties.Status)] ?? "planning",
      objective: richTextOf(properties.Objective) || null,
    };
  });

  // -- Tasks ---------------------------------------------------------
  const tasks: TaskSource[] = rowsOf(root, "Tasks").map((page) => {
    const properties = asObject(page.properties);
    const done = asObject(properties.Done).checkbox === true;
    return {
      notionId: String(page.id ?? ""),
      title: titleOf(page),
      projectNotionId: firstRelationId(properties.Project),
      responsableNotionId: firstRelationId(properties.Responsable),
      status: done ? "done" : (NOTION_TASK_STATUS[selectName(properties.Status)] ?? "todo"),
      priority: NOTION_PRIORITY[selectName(properties.Priority)] ?? "medium",
      dueDate: dateStart(properties.Deadline),
      done,
    };
  });

  // -- Team --------------------------------------------------------
  // All seven, unfiltered: `run.ts` uses the page id to resolve a task's
  // Responsable to a real person, and separately uses the responsibilities
  // text (where there is any) for the job-title pass.
  const team: TeamSource[] = rowsOf(root, "Team")
    .map((page) => {
      const properties = asObject(page.properties);
      return {
        notionId: String(page.id ?? ""),
        name: titleOf(page),
        role: richTextOf(properties.Role),
        responsibilities: richTextOf(properties.Responsibilities),
      };
    })
    .filter((member) => member.name);

  // -- Documents (free-standing pages) --------------------------------
  const pages = asObject(root.pages);
  const documents: DocumentSource[] = Object.entries(DOCUMENT_PAGES)
    .map(([pageId, config]) => {
      const page = asObject(asObject(pages[pageId]).metadata);
      const blocks = blocksFor(pageId);
      if (blocks.length === 0) return null;
      const title = stripLeadingNumber(titleOf(page) || "Untitled");
      const sections = sectionsFromBlocks(blocks, title);
      return {
        notionId: pageId,
        title,
        kind: config.kind,
        projectName: config.projectName ?? null,
        summary: sections[0]?.body?.slice(0, 2000) || null,
        sections,
      };
    })
    .filter((document): document is DocumentSource => document !== null && document.sections.length > 0);

  return { sops, projects, tasks, team, documents };
}
