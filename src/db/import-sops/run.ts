import { and, eq } from "drizzle-orm";

import { slugify } from "@/lib/slug";

import { closeDb, db } from "../client";
import { memberships, organizations, sops, sopSteps, users } from "../schema";
import { deterministicId } from "./identity";
import { EXPECTED_SECTIONS, readSopExport, type SopSource } from "./read";

/**
 * Bring the twelve Mediast SOPs across from the Notion export.
 *
 * A one-off, and a separate source from `db:migrate:mongo` -- see MIGRATION.md.
 * The old app's Mongo has no procedure text; the Notion workspace does, and
 * only that. Projects, Tasks and Team in the same export are name-only and
 * overlap what the Mongo migration already carries with real dates and owners,
 * so this importer deliberately touches nothing but `sops` and `sop_steps`.
 *
 *   npm run db:import:sops -- --file ./Mediast_OS_API_Raw_Export.json
 *   npm run db:import:sops -- --file ./Mediast_OS_API_Raw_Export.json --commit
 *
 * Without `--commit` it reads, works out every row, prints the report and
 * stops. Row ids are derived from the Notion page id (see `identity.ts`), so a
 * second run updates what the first one wrote rather than duplicating it, and
 * the steps of each procedure are replaced wholesale -- the same shape
 * `replaceSteps` in `src/lib/data/sops.ts` already uses.
 */

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

type Options = { file: string; orgSlug: string; commit: boolean };

function parseArgs(argv: string[]): Options | { error: string } {
  const flag = (name: string, fallback?: string) => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    return argv[index + 1];
  };

  const file = flag("file");
  if (!file) {
    return { error: "--file is required, e.g. --file ./Mediast_OS_API_Raw_Export.json" };
  }

  return { file, orgSlug: flag("org", "mediast")!, commit: argv.includes("--commit") };
}

// ---------------------------------------------------------------------------
// The editor's own limits, so an imported row is one a person can then edit.
// (`src/lib/actions/sops.ts`: title .max(200), summary .max(2000),
//  step title .max(300), step detail .max(4000), steps .min(1).max(50).)
// ---------------------------------------------------------------------------

const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const STEP_TITLE_MAX = 300;
const STEP_DETAIL_MAX = 4000;

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

class Report {
  private readonly carried = new Map<string, number>();
  readonly notes: string[] = [];
  readonly warnings: string[] = [];

  carry(what: string, count = 1) {
    this.carried.set(what, (this.carried.get(what) ?? 0) + count);
  }

  note(line: string) {
    this.notes.push(line);
  }

  warn(line: string) {
    this.warnings.push(line);
  }

  print(commit: boolean) {
    const pad = (value: number) => String(value).padStart(5);

    console.log(`\n${commit ? "IMPORTING" : "DRY RUN -- nothing will be written"}\n`);

    console.log("Carried across");
    for (const [what, count] of [...this.carried].sort()) {
      console.log(`  ${pad(count)}  ${what}`);
    }

    if (this.notes.length > 0) {
      console.log("\nDecisions this run made");
      for (const line of this.notes) console.log(`  - ${line}`);
    }

    if (this.warnings.length > 0) {
      console.log("\nWorth a look before committing");
      for (const line of this.warnings) console.log(`  ! ${line}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Planning: pure once the two DB reads are done, so dry run and real run agree
// ---------------------------------------------------------------------------

type SopPlan = {
  id: string;
  row: typeof sops.$inferInsert;
  steps: (typeof sopSteps.$inferInsert)[];
  isNew: boolean;
};

type Plan = { organizationId: string; organizationName: string; sops: SopPlan[] };

function clamp(value: string, max: number, label: string, report: Report): string {
  if (value.length <= max) return value;
  report.warn(`${label} was ${value.length} chars, trimmed to ${max}.`);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

async function planImport(
  source: SopSource[],
  options: Options,
  report: Report,
): Promise<{ plan: Plan } | { error: string }> {
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, options.orgSlug))
    .limit(1);

  if (!org) {
    return { error: `No organization with slug "${options.orgSlug}". Nothing to import into.` };
  }

  const [owner] = await db
    .select({ userId: memberships.userId, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, org.id), eq(memberships.role, "owner")))
    .limit(1);

  if (owner) {
    report.note(`Author of the imported procedures: ${owner.name} (the "${options.orgSlug}" owner).`);
  } else {
    report.warn(`"${options.orgSlug}" has no owner; created_by_user_id is left null on all rows.`);
  }

  const existing = await db
    .select({ id: sops.id, slug: sops.slug })
    .from(sops)
    .where(eq(sops.organizationId, org.id));

  const existingIds = new Set(existing.map((row) => row.id));
  const takenSlugs = new Set(existing.map((row) => row.slug));

  const plans: SopPlan[] = [];

  for (const sop of source) {
    if (!sop.title) {
      report.warn(`A procedure page (${sop.notionId}) has no title; skipped.`);
      continue;
    }
    if (sop.sections.length !== EXPECTED_SECTIONS) {
      report.warn(
        `"${sop.title}" parsed ${sop.sections.length} sections, expected ${EXPECTED_SECTIONS}.`,
      );
    }

    const id = deterministicId("sop", sop.notionId);
    const isNew = !existingIds.has(id);

    let slug = existing.find((row) => row.id === id)?.slug ?? "";
    if (!slug) {
      const base = slugify(sop.title, "sop");
      slug = base;
      for (let suffix = 2; takenSlugs.has(slug); suffix += 1) {
        if (suffix > 500) return { error: `Could not find a free slug for "${sop.title}".` };
        slug = `${base}-${suffix}`;
      }
      if (slug !== base) report.warn(`"${sop.title}" slug taken; using "${slug}".`);
      takenSlugs.add(slug);
    }

    const steps = sop.sections.slice(0, 50).map((section, index) => ({
      id: deterministicId("sop-step", `${sop.notionId}:${index}`),
      organizationId: org.id,
      sopId: id,
      position: index,
      title: clamp(section.heading || `Section ${index + 1}`, STEP_TITLE_MAX, `"${sop.title}" step ${index + 1} title`, report),
      detail: section.body
        ? clamp(section.body, STEP_DETAIL_MAX, `"${sop.title}" step ${index + 1} detail`, report)
        : null,
    }));

    plans.push({
      id,
      isNew,
      steps,
      row: {
        id,
        organizationId: org.id,
        slug,
        title: clamp(sop.title, TITLE_MAX, `"${sop.title}" title`, report),
        summary: sop.objective
          ? clamp(sop.objective, SUMMARY_MAX, `"${sop.title}" summary`, report)
          : null,
        status: "draft" as const,
        departmentId: null,
        ownerUserId: null,
        reviewIntervalDays: 180,
        lastReviewedOn: null,
        createdByUserId: owner?.userId ?? null,
      },
    });
  }

  report.carry("procedures new", plans.filter((p) => p.isNew).length);
  report.carry("procedures updated", plans.filter((p) => !p.isNew).length);
  report.carry("procedure steps", plans.reduce((sum, p) => sum + p.steps.length, 0));
  report.note(
    'The "version initiale" callout above section 1 on every page is not carried; ' +
      "status \"draft\" already says the same thing.",
  );
  report.note(
    "Owner and department are left unset -- the Notion owner is a role title, and the " +
      "SOP-owner relation points at Team pages that are not people in this org. " +
      "Set them in the SOP editor once the real team exists here (KNOWN-GAPS.md).",
  );

  return { plan: { organizationId: org.id, organizationName: org.name, sops: plans } };
}

// ---------------------------------------------------------------------------
// Writing: one transaction; steps replaced wholesale per procedure
// ---------------------------------------------------------------------------

async function write(plan: Plan) {
  await db.transaction(async (tx) => {
    for (const sop of plan.sops) {
      await tx
        .insert(sops)
        .values(sop.row)
        .onConflictDoUpdate({
          target: sops.id,
          set: {
            slug: sop.row.slug,
            title: sop.row.title,
            summary: sop.row.summary,
            status: sop.row.status,
            updatedAt: new Date(),
          },
        });

      await tx.delete(sopSteps).where(eq(sopSteps.sopId, sop.id));
      if (sop.steps.length > 0) await tx.insert(sopSteps).values(sop.steps);
    }
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if ("error" in options) {
    console.error(options.error);
    process.exit(1);
  }

  console.log(`Reading ${options.file}`);
  const source = readSopExport(options.file);
  console.log(`Found ${source.length} procedures in the SOP Library.`);

  const report = new Report();
  const planned = await planImport(source, options, report);

  if ("error" in planned) {
    console.error(`\nRefusing to import: ${planned.error}`);
    process.exit(1);
  }

  report.print(options.commit);

  if (!options.commit) {
    console.log("\nNothing was written. Re-run with --commit to apply.\n");
    return;
  }

  const already = planned.plan.sops.filter((p) => !p.isNew).length;
  if (already > 0) {
    console.log(`\n${already} of these procedures already exist; re-running updates them.`);
  }

  await write(planned.plan);
  console.log(
    `\nDone. ${planned.plan.sops.length} procedures in "${planned.plan.organizationName}" (${planned.plan.organizationId}).\n`,
  );
}

main()
  .then(closeDb)
  .catch(async (error) => {
    console.error("\nImport failed:", error);
    await closeDb();
    process.exit(1);
  });
