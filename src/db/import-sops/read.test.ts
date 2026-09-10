import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED_SECTIONS, readSopExport } from "./read";

/**
 * The parser, against a trimmed slice of the real export -- two of the twelve
 * procedures ("Monthly Reporting", "Client Onboarding"), their blocks kept
 * verbatim but stripped of annotation noise, plus a decoy "Untitled" database
 * so the title match has something to reject.
 */

const FIXTURE = fileURLToPath(new URL("./__fixtures__/sop-export.sample.json", import.meta.url));

// The editor's ceilings (`src/lib/actions/sops.ts`). The real content must sit
// under all of them, or the import would silently trim words.
const CAPS = { title: 200, summary: 2000, stepTitle: 300, stepDetail: 4000 };

describe("readSopExport", () => {
  const sops = readSopExport(FIXTURE);

  it("returns every procedure in the SOP data source", () => {
    expect(sops.map((s) => s.title).sort()).toEqual(["Client Onboarding", "Monthly Reporting"]);
  });

  it("splits each page into the twelve fixed sections", () => {
    for (const sop of sops) {
      expect(sop.sections).toHaveLength(EXPECTED_SECTIONS);
    }
  });

  it("keeps the section emoji but drops Notion's leading number", () => {
    const onboarding = sops.find((s) => s.title === "Client Onboarding")!;
    expect(onboarding.sections[0].heading).toBe("🎯 Objective");
    expect(onboarding.sections.at(-1)!.heading).toBe("➡️ Next Step");
    expect(onboarding.sections.every((s) => !/^\d/.test(s.heading))).toBe(true);
  });

  it("takes the summary from the Objective section's prose", () => {
    const onboarding = sops.find((s) => s.title === "Client Onboarding")!;
    expect(onboarding.objective).toBe(onboarding.sections[0].body);
    expect(onboarding.objective.length).toBeGreaterThan(80);
  });

  it("flattens rich blocks to plain-text lines", () => {
    const onboarding = sops.find((s) => s.title === "Client Onboarding")!;
    const body = onboarding.sections.map((s) => s.body).join("\n");

    expect(body).toMatch(/^- .+/m); // 📥 Inputs Required -> bullets
    expect(body).toMatch(/^\[ \] .+/m); // ✅ Operational Checklist -> to-dos
    expect(body).toMatch(/^### Step 1 /m); // 📋 Step-by-Step -> heading_3
  });

  it("produces content that fits the SOP editor's limits", () => {
    for (const sop of sops) {
      expect(sop.title.length).toBeLessThanOrEqual(CAPS.title);
      expect(sop.objective.length).toBeLessThanOrEqual(CAPS.summary);
      for (const section of sop.sections) {
        expect(section.heading.length).toBeLessThanOrEqual(CAPS.stepTitle);
        expect(section.body.length).toBeLessThanOrEqual(CAPS.stepDetail);
      }
    }
  });

  it("refuses a file that is not this export", () => {
    const path = join(mkdtempSync(join(tmpdir(), "sop-import-")), "not-an-export.json");
    writeFileSync(path, JSON.stringify({ pages: {} }));
    expect(() => readSopExport(path)).toThrow(/SOP Library/);
  });
});
