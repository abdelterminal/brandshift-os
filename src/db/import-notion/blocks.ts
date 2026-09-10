/**
 * Notion blocks, flattened to the plain-text sections this app stores.
 *
 * Both `sops`/`sop_steps` and `documents`/`document_sections` model a body as
 * ordered sections of plain text -- see the schema comments for why (no
 * Markdown parser, no HTML-injection surface). A Notion page's body is a flat
 * list of blocks with `heading_2`s marking sections, so the translation is:
 * split on `heading_2`, and within a section render each block to one line.
 */

export type Json = Record<string, unknown>;

export type Section = { heading: string; body: string };

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

/** Notion rich text -> plain string. Annotations and links are not carried. */
export function plainText(richText: unknown): string {
  return asArray(richText)
    .map((node) => String(asObject(node).plain_text ?? ""))
    .join("")
    .trim();
}

/** `"1. 🎯 Objective"` -> `"🎯 Objective"`. The numbering is Notion's, not ours. */
export function stripLeadingNumber(heading: string): string {
  return heading.replace(/^\s*\d+\.\s*/, "").trim();
}

/**
 * One body block -> one line of plain text.
 *
 * A bullet becomes `- …`, a checklist item `[ ] …`, a sub-heading gets a blank
 * line before it, and anything else is just its text. Empty blocks (spacers)
 * drop out.
 */
export function renderBlock(block: Json): string {
  const type = String(block.type ?? "");
  const node = asObject(block[type]);
  const text = plainText(node.rich_text);
  if (!text) return "";

  switch (type) {
    case "heading_1":
    case "heading_2":
    case "heading_3":
      // A blank line before it, so a sub-heading reads as one. No `#` marker:
      // the detail is plain text, nothing parses it.
      return `\n${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `${node.checked === true ? "[x]" : "[ ]"} ${text}`;
    default:
      // paragraph, quote, callout, toggle, and anything unforeseen: keep the
      // words, lose the formatting.
      return text;
  }
}

/**
 * A page's blocks -> its sections.
 *
 * When the page has `heading_2`s, each starts a section and the blocks before
 * the first one are dropped (they are the "version initiale" callout on every
 * SOP, or a page's own lede). When it has none -- a wiki page that is just
 * prose and `heading_3`s -- the whole body becomes a single untitled section
 * so nothing is lost.
 */
export function sectionsFromBlocks(blocks: Json[], fallbackHeading: string): Section[] {
  const hasH2 = blocks.some((block) => block.type === "heading_2");

  const sections: Section[] = [];
  let current: Section | null = null;
  const lines: string[] = [];

  const flush = () => {
    if (current) {
      current.body = lines.join("\n").trim();
      sections.push(current);
    }
    lines.length = 0;
  };

  if (!hasH2) {
    current = { heading: fallbackHeading, body: "" };
  }

  for (const block of blocks) {
    if (block.type === "heading_2") {
      flush();
      current = { heading: stripLeadingNumber(plainText(asObject(block.heading_2).rich_text)), body: "" };
      continue;
    }
    if (!current) continue;
    const line = renderBlock(block);
    if (line) lines.push(line);
  }
  flush();

  return sections.filter((section) => section.heading || section.body);
}
