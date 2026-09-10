import { describe, expect, it } from "vitest";

import { renderBlock, sectionsFromBlocks, stripLeadingNumber, type Json } from "./blocks";

/**
 * The block flattener is the one piece of the Notion importer with real logic
 * in it -- everything else in `read.ts` is field access. `run.ts` itself is
 * verified by a dry run against a copy of the database, the same as the Mongo
 * migration's `run.ts`.
 */

const rt = (text: string) => ({ rich_text: [{ plain_text: text }] });
const block = (type: string, node: Json): Json => ({ type, [type]: node });

describe("stripLeadingNumber", () => {
  it("drops Notion's section numbering, keeps the emoji", () => {
    expect(stripLeadingNumber("1. 🎯 Objective")).toBe("🎯 Objective");
    expect(stripLeadingNumber("12.  ➡️ Next Step")).toBe("➡️ Next Step");
    expect(stripLeadingNumber("Positioning")).toBe("Positioning");
  });
});

describe("renderBlock", () => {
  it("prefixes list items and checkboxes, leaves paragraphs alone", () => {
    expect(renderBlock(block("bulleted_list_item", rt("A point")))).toBe("- A point");
    expect(renderBlock(block("to_do", { ...rt("Done thing"), checked: true }))).toBe("[x] Done thing");
    expect(renderBlock(block("to_do", { ...rt("Open thing"), checked: false }))).toBe("[ ] Open thing");
    expect(renderBlock(block("paragraph", rt("Just prose.")))).toBe("Just prose.");
  });

  it("puts a blank line before a sub-heading and no # marker", () => {
    expect(renderBlock(block("heading_3", rt("Step 2 — Do it")))).toBe("\nStep 2 — Do it");
  });

  it("drops an empty block", () => {
    expect(renderBlock(block("paragraph", { rich_text: [] }))).toBe("");
  });
});

describe("sectionsFromBlocks", () => {
  const withHeadings: Json[] = [
    block("callout", rt("version initiale, ignore me")),
    block("heading_2", rt("1. 🎯 Objective")),
    block("paragraph", rt("Turn a won client into a ready project.")),
    block("heading_2", rt("4. 📥 Inputs Required")),
    block("bulleted_list_item", rt("The signed quote")),
    block("bulleted_list_item", rt("Brand assets")),
    block("heading_2", rt("6. 📋 Step-by-Step")),
    block("heading_3", rt("Step 1 — Validate the handover")),
    block("paragraph", rt("Read the quote.")),
    block("heading_3", rt("Step 2 — Create the space")),
    block("paragraph", rt("Make the folder.")),
  ];

  it("splits on heading_2 and drops the blocks before the first one", () => {
    const sections = sectionsFromBlocks(withHeadings, "fallback");
    expect(sections.map((s) => s.heading)).toEqual([
      "🎯 Objective",
      "📥 Inputs Required",
      "📋 Step-by-Step",
    ]);
    expect(sections[1]!.body).toBe("- The signed quote\n- Brand assets");
    expect(sections[2]!.body).toMatch(/\n\nStep 2 — Create the space/);
  });

  it("makes a single fallback section when the page has no heading_2", () => {
    const flat: Json[] = [
      block("paragraph", rt("A wiki page that is just prose.")),
      block("heading_3", rt("A sub-heading")),
      block("paragraph", rt("More prose.")),
    ];
    const sections = sectionsFromBlocks(flat, "Mediast HQ");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe("Mediast HQ");
    expect(sections[0]!.body).toContain("A wiki page that is just prose.");
    expect(sections[0]!.body).toContain("\n\nA sub-heading");
  });
});
