import { readFileSync } from "node:fs";

/**
 * The Notion export, translated -- reading half.
 *
 * The source is a Notion API dump of the old "Mediast OS" workspace
 * (`Mediast_OS_API_Raw_Export.json`): `{ pages, blocks_by_page, databases,
 * data_sources, users }`. The only part this importer wants is the **SOP
 * Library — Mediast Creative** data source: twelve procedures, each a page
 * whose body is exactly twelve `heading_2` sections in a fixed order
 * (🎯 Objective, 👤 Owner & Responsibilities, … ➡️ Next Step).
 *
 * Everything here is a pure function from that JSON to the shape `run.ts`
 * writes, and nothing touches a database -- which is what lets the translation
 * be tested against a trimmed fixture with no Postgres in sight.
 *
 * The rule, as in the Mongo migration: **translate, never invent.** A block
 * type with no home is flattened to its text rather than guessed at, and the
 * "version initiale" callout that sits above the first heading on every page
 * is dropped and counted -- `run.ts` says so in its report.
 */

/** The database whose data source holds the procedures. Matched by title. */
export const SOP_DATABASE_TITLE = "SOP Library — Mediast Creative";

/** Every procedure page carries this many `heading_2` sections. */
export const EXPECTED_SECTIONS = 12;

type Json = Record<string, unknown>;

export type SopSection = { heading: string; body: string };

export type SopSource = {
  /** The Notion page id, the seed for this row's deterministic id. */
  notionId: string;
  title: string;
  /** The 🎯 Objective section's prose, collapsed to one paragraph -- `sops.summary`. */
  objective: string;
  /** The twelve sections, in document order -- one `sop_steps` row each. */
  sections: SopSection[];
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

/** Notion rich text -> plain string. Annotations and links are not carried. */
function plainText(richText: unknown): string {
  return asArray(richText)
    .map((node) => String(asObject(node).plain_text ?? ""))
    .join("")
    .trim();
}

/** `"1. 🎯 Objective"` -> `"🎯 Objective"`. The numbering is Notion's, not ours. */
function stripLeadingNumber(heading: string): string {
  return heading.replace(/^\s*\d+\.\s*/, "").trim();
}

/**
 * One body block -> one line of plain text.
 *
 * The procedure library models a step as `{ title, detail }` where detail is
 * plain text that renders with no Markdown parser (see `src/db/schema/sops.ts`).
 * So a bullet becomes `- …`, a checklist item `[ ] …`, a sub-step heading
 * `### …`, and anything else is just its text. Empty blocks (spacers) drop out.
 */
function renderBlock(block: Json): string {
  const type = String(block.type ?? "");
  const node = asObject(block[type]);
  const text = plainText(node.rich_text);
  if (!text) return "";

  switch (type) {
    case "heading_1":
    case "heading_2":
    case "heading_3":
      // A blank line before it, so a sub-step heading ("Step 3 — …") reads as
      // one. No `#` marker: the detail is plain text, nothing parses it.
      return `\n${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `${node.checked === true ? "[x]" : "[ ]"} ${text}`;
    default:
      // paragraph, quote, callout, toggle, and anything unforeseen: keep the
      // words, lose the formatting. Better than dropping a sentence.
      return text;
  }
}

function titleOf(page: Json): string {
  const properties = asObject(page.properties);
  for (const value of Object.values(properties)) {
    const property = asObject(value);
    if (property.type === "title") return plainText(property.title);
  }
  return "";
}

/**
 * Resolve the SOP data source id by the title of the database it belongs to,
 * rather than hard-coding it -- a re-export would keep the title and change
 * the id.
 */
function findSopDataSourceId(root: Json): string {
  const databases = asObject(root.databases);
  const dataSources = asObject(root.data_sources);

  const sopDatabaseId = Object.entries(databases).find(
    ([, value]) => plainText(asObject(value).title) === SOP_DATABASE_TITLE,
  )?.[0];

  if (!sopDatabaseId) {
    throw new Error(
      `No database titled "${SOP_DATABASE_TITLE}" in the export. Is this the right file?`,
    );
  }

  const entry = Object.entries(dataSources).find(
    ([, value]) => asObject(value).database_id === sopDatabaseId,
  );

  if (!entry) {
    throw new Error(`The "${SOP_DATABASE_TITLE}" database has no data source in the export.`);
  }

  return entry[0];
}

/**
 * Read the export and return the twelve procedures.
 *
 * Order follows the data source's own row order. A page with a section count
 * other than twelve is still returned -- `run.ts` warns about it rather than
 * this throwing -- because a partial import a human can inspect beats a hard
 * stop on a file that is 99% fine.
 */
export function readSopExport(filePath: string): SopSource[] {
  let root: Json;
  try {
    root = asObject(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new Error(
      `Could not read the export at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const dataSourceId = findSopDataSourceId(root);
  const dataSource = asObject(asObject(root.data_sources)[dataSourceId]);
  const blocksByPage = asObject(root.blocks_by_page);

  return asArray(dataSource.rows).map((rawRow) => {
    const page = asObject(rawRow);
    const notionId = String(page.id ?? "");
    const blocks = asArray(blocksByPage[notionId]).map(asObject);

    const sections: SopSection[] = [];
    let current: SopSection | null = null;
    const lines: string[] = [];

    const flush = () => {
      if (current) {
        current.body = lines.join("\n").trim();
        sections.push(current);
      }
      lines.length = 0;
    };

    for (const block of blocks) {
      if (block.type === "heading_2") {
        flush();
        current = { heading: stripLeadingNumber(plainText(asObject(block.heading_2).rich_text)), body: "" };
        continue;
      }
      if (!current) continue; // the "version initiale" callout, before section 1
      const line = renderBlock(block);
      if (line) lines.push(line);
    }
    flush();

    const objective = sections[0]?.body ?? "";

    return { notionId, title: titleOf(page), objective, sections };
  });
}
