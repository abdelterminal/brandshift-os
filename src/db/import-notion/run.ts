import { and, eq } from "drizzle-orm";

import { projectKey } from "@/db/migrate/map";
import { slugify } from "@/lib/slug";

import { closeDb, db } from "../client";
import {
  documentSections,
  documents,
  memberships,
  organizations,
  projects,
  sopSteps,
  sops,
  tasks,
  users,
} from "../schema";
import { deterministicId } from "./identity";
import { readNotionExport, type NotionSource } from "./read";

/**
 * Bring the retired Notion workspace across.
 *
 * A one-shot: Notion is going away, so there is no sync, and this runs a few
 * times against a copy to get the report clean, then once with `--commit`.
 * Row ids are derived from the Notion id (`identity.ts`), so a second run
 * updates instead of duplicating -- and the SOP ids match the ones the first,
 * SOP-only import already wrote, so those come back as "updated, 0 new".
 *
 *   npm run db:import:notion -- --file ./Mediast_OS_API_Raw_Export.json
 *   npm run db:import:notion -- --file ./Mediast_OS_API_Raw_Export.json --commit
 */

// ---------------------------------------------------------------------------

type Options = { file: string; orgSlug: string; commit: boolean };

function parseArgs(argv: string[]): Options | { error: string } {
  const flag = (name: string, fallback?: string) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : argv[index + 1];
  };
  const file = flag("file");
  if (!file) return { error: "--file is required, e.g. --file ./Mediast_OS_API_Raw_Export.json" };
  return { file, orgSlug: flag("org", "mediast")!, commit: argv.includes("--commit") };
}

// The editor limits (`src/lib/actions/{sops,documents}.ts`).
const CAPS = { title: 200, summary: 2000, sectionTitle: 300, sectionDetail: 4000 };

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
    const pad = (n: number) => String(n).padStart(5);
    console.log(`\n${commit ? "IMPORTING" : "DRY RUN -- nothing will be written"}\n`);
    console.log("Carried across");
    for (const [what, count] of [...this.carried].sort()) console.log(`  ${pad(count)}  ${what}`);
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

function clamp(value: string, max: number, label: string, report: Report): string {
  if (value.length <= max) return value;
  report.warn(`${label} was ${value.length} chars, trimmed to ${max}.`);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------

type Plan = {
  organizationId: string;
  organizationName: string;
  authorUserId: string | null;
  sopRows: (typeof sops.$inferInsert)[];
  sopStepRows: Map<string, (typeof sopSteps.$inferInsert)[]>;
  projectRows: (typeof projects.$inferInsert)[];
  taskRows: (typeof tasks.$inferInsert)[];
  documentRows: (typeof documents.$inferInsert)[];
  documentSectionRows: Map<string, (typeof documentSections.$inferInsert)[]>;
  membershipUpdates: { id: string; jobTitle: string }[];
};

async function planImport(
  source: NotionSource,
  options: Options,
  report: Report,
): Promise<{ plan: Plan } | { error: string }> {
  const [found] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, options.orgSlug))
    .limit(1);
  if (!found) {
    return { error: `No organization with slug "${options.orgSlug}". Nothing to import into.` };
  }

  const [owner] = await db
    .select({ userId: memberships.userId, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, found.id), eq(memberships.role, "owner")))
    .limit(1);
  const authorUserId = owner?.userId ?? null;
  if (owner) report.note(`Author of imported rows: ${owner.name} (the "${options.orgSlug}" owner).`);
  else report.warn(`"${options.orgSlug}" has no owner; created_by_user_id is left null.`);

  // Existing rows, for slug/key uniqueness and new-vs-updated counts.
  const [existingSops, existingProjects, existingDocs, existingMembers] = await Promise.all([
    db.select({ id: sops.id, slug: sops.slug }).from(sops).where(eq(sops.organizationId, found.id)),
    db
      .select({ id: projects.id, key: projects.key })
      .from(projects)
      .where(eq(projects.organizationId, found.id)),
    db
      .select({ id: documents.id, slug: documents.slug })
      .from(documents)
      .where(eq(documents.organizationId, found.id)),
    db
      .select({ id: memberships.id, userId: memberships.userId, name: users.name, jobTitle: memberships.jobTitle })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, found.id)),
  ]);

  const sopSlugs = new Set(existingSops.map((r) => r.slug));
  const sopIds = new Set(existingSops.map((r) => r.id));
  const projectKeys = new Set(existingProjects.map((r) => r.key));
  const docSlugs = new Set(existingDocs.map((r) => r.slug));
  const docIds = new Set(existingDocs.map((r) => r.id));

  const orgId = found.id;
  const freshSlug = (base: string, taken: Set<string>) => {
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    return slug;
  };

  // -- SOPs ------------------------------------------------------------
  const sopRows: (typeof sops.$inferInsert)[] = [];
  const sopStepRows = new Map<string, (typeof sopSteps.$inferInsert)[]>();
  let sopsNew = 0;
  for (const sop of source.sops) {
    if (!sop.title) continue;
    const id = deterministicId("sop", sop.notionId);
    if (!sopIds.has(id)) sopsNew += 1;
    const slug =
      existingSops.find((r) => r.id === id)?.slug ?? freshSlug(slugify(sop.title, "sop"), sopSlugs);
    sopRows.push({
      id,
      organizationId: orgId,
      slug,
      title: clamp(sop.title, CAPS.title, `SOP "${sop.title}" title`, report),
      summary: sop.objective ? clamp(sop.objective, CAPS.summary, `SOP "${sop.title}" summary`, report) : null,
      status: "draft",
      stage: (sop.stage as (typeof sops.$inferInsert)["stage"]) ?? null,
      reviewIntervalDays: 180,
      createdByUserId: authorUserId,
    });
    sopStepRows.set(
      id,
      sop.sections.slice(0, 50).map((section, i) => ({
        id: deterministicId("sop-step", `${sop.notionId}:${i}`),
        organizationId: orgId,
        sopId: id,
        position: i,
        title: clamp(section.heading || `Section ${i + 1}`, CAPS.sectionTitle, "SOP step title", report),
        detail: section.body ? clamp(section.body, CAPS.sectionDetail, "SOP step detail", report) : null,
      })),
    );
  }
  report.carry("procedures new", sopsNew);
  report.carry("procedures updated", sopRows.length - sopsNew);
  report.carry("procedure steps", [...sopStepRows.values()].reduce((s, a) => s + a.length, 0));

  // -- Projects -----------------------------------------------------
  const projectRows: (typeof projects.$inferInsert)[] = [];
  const projectIdByNotion = new Map<string, string>();
  const projectIdByName = new Map<string, string>();
  let projectsNew = 0;
  for (const project of source.projects) {
    if (!project.name) continue;
    const id = deterministicId("project", project.notionId);
    projectIdByNotion.set(project.notionId, id);
    projectIdByName.set(project.name.toLowerCase(), id);
    const existing = existingProjects.find((r) => r.id === id);
    if (!existing) projectsNew += 1;
    const key = existing?.key ?? projectKey(project.name, projectKeys);
    projectRows.push({
      id,
      organizationId: orgId,
      key,
      name: clamp(project.name, CAPS.title, `Project "${project.name}" name`, report),
      description: project.objective
        ? clamp(project.objective, 4000, `Project "${project.name}" notes`, report)
        : null,
      status: project.status as (typeof projects.$inferInsert)["status"],
      priority: "medium",
      createdByUserId: authorUserId,
    });
  }
  report.carry("projects new", projectsNew);
  report.carry("projects updated", projectRows.length - projectsNew);

  // -- Tasks -------------------------------------------------------
  const taskRows: (typeof tasks.$inferInsert)[] = [];
  let orphanTasks = 0;
  source.tasks.forEach((task, index) => {
    if (!task.title) return;
    const projectId = task.projectNotionId
      ? projectIdByNotion.get(task.projectNotionId) ?? null
      : null;
    if (!projectId) {
      orphanTasks += 1;
      return;
    }
    taskRows.push({
      id: deterministicId("task", task.notionId),
      organizationId: orgId,
      projectId,
      title: clamp(task.title, CAPS.title, "task title", report),
      status: task.status as (typeof tasks.$inferInsert)["status"],
      priority: task.priority as (typeof tasks.$inferInsert)["priority"],
      dueDate: task.dueDate,
      position: index,
      createdByUserId: authorUserId,
    });
  });
  report.carry("tasks", taskRows.length);
  report.note(
    `${orphanTasks} tasks skipped -- their Notion project is not one of the imported ones.`,
  );
  report.note(
    "Tasks come across with no assignee: the Notion \"Responsable\" points at a Team page, " +
      "not a person in this org. Assign them on the board.",
  );

  // -- Team responsibilities -> jobTitle ----------------------------
  const membershipUpdates: { id: string; jobTitle: string }[] = [];
  for (const member of source.team) {
    const first = member.name.split(/\s+/)[0]!.toLowerCase();
    const match = existingMembers.find((m) => m.name.toLowerCase().split(/\s+/)[0] === first);
    if (!match) {
      report.warn(`Team member "${member.name}" has no matching person in "${options.orgSlug}".`);
      continue;
    }
    if (match.jobTitle && match.jobTitle.trim().length > 0) continue;
    const jobTitle = clamp(
      [member.role, member.responsibilities].filter(Boolean).join(" — "),
      200,
      `${member.name} job title`,
      report,
    );
    membershipUpdates.push({ id: match.id, jobTitle });
  }
  report.carry("people given a role description", membershipUpdates.length);

  // -- Documents -------------------------------------------------
  const documentRows: (typeof documents.$inferInsert)[] = [];
  const documentSectionRows = new Map<string, (typeof documentSections.$inferInsert)[]>();
  let docsNew = 0;
  for (const document of source.documents) {
    if (!document.title) continue;
    const id = deterministicId("document", document.notionId);
    if (!docIds.has(id)) docsNew += 1;
    const slug =
      existingDocs.find((r) => r.id === id)?.slug ??
      freshSlug(slugify(document.title, "document"), docSlugs);
    const projectId = document.projectName
      ? projectIdByName.get(document.projectName.toLowerCase()) ?? null
      : null;
    if (document.projectName && !projectId) {
      report.warn(`Document "${document.title}" wants project "${document.projectName}", which was not imported.`);
    }
    documentRows.push({
      id,
      organizationId: orgId,
      slug,
      title: clamp(document.title, CAPS.title, `Document "${document.title}" title`, report),
      summary: document.summary
        ? clamp(document.summary, CAPS.summary, `Document "${document.title}" summary`, report)
        : null,
      kind: document.kind as (typeof documents.$inferInsert)["kind"],
      projectId,
      ownerUserId: authorUserId,
      createdByUserId: authorUserId,
    });
    documentSectionRows.set(
      id,
      document.sections.slice(0, 50).map((section, i) => ({
        id: deterministicId("document-section", `${document.notionId}:${i}`),
        organizationId: orgId,
        documentId: id,
        position: i,
        title: clamp(section.heading || `Section ${i + 1}`, CAPS.sectionTitle, "document section title", report),
        detail: section.body
          ? clamp(section.body, CAPS.sectionDetail, "document section detail", report)
          : null,
      })),
    );
  }
  report.carry("documents new", docsNew);
  report.carry("documents updated", documentRows.length - docsNew);
  report.carry(
    "document sections",
    [...documentSectionRows.values()].reduce((s, a) => s + a.length, 0),
  );

  report.note(
    "Empty Notion databases (Clients, CRM Commercial, Objectives & KPI, Weekly Reviews) and " +
      "page covers, icons and attachments are not carried -- there is nothing in them.",
  );

  return {
    plan: {
      organizationId: orgId,
      organizationName: found.name,
      authorUserId,
      sopRows,
      sopStepRows,
      projectRows,
      taskRows,
      documentRows,
      documentSectionRows,
      membershipUpdates,
    },
  };
}

// ---------------------------------------------------------------------------

async function write(plan: Plan) {
  await db.transaction(async (tx) => {
    for (const row of plan.projectRows) {
      await tx
        .insert(projects)
        .values(row)
        .onConflictDoUpdate({
          target: projects.id,
          set: { name: row.name, description: row.description, status: row.status },
        });
    }

    for (const row of plan.taskRows) {
      await tx
        .insert(tasks)
        .values(row)
        .onConflictDoUpdate({
          target: tasks.id,
          set: { title: row.title, status: row.status, priority: row.priority, dueDate: row.dueDate },
        });
    }

    for (const update of plan.membershipUpdates) {
      await tx
        .update(memberships)
        .set({ jobTitle: update.jobTitle })
        .where(eq(memberships.id, update.id));
    }

    for (const row of plan.sopRows) {
      await tx
        .insert(sops)
        .values(row)
        .onConflictDoUpdate({
          target: sops.id,
          set: {
            slug: row.slug,
            title: row.title,
            summary: row.summary,
            status: row.status,
            stage: row.stage,
            updatedAt: new Date(),
          },
        });
      await tx.delete(sopSteps).where(eq(sopSteps.sopId, row.id!));
      const steps = plan.sopStepRows.get(row.id!) ?? [];
      if (steps.length > 0) await tx.insert(sopSteps).values(steps);
    }

    for (const row of plan.documentRows) {
      await tx
        .insert(documents)
        .values(row)
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            slug: row.slug,
            title: row.title,
            summary: row.summary,
            kind: row.kind,
            projectId: row.projectId,
            updatedAt: new Date(),
          },
        });
      await tx.delete(documentSections).where(eq(documentSections.documentId, row.id!));
      const sections = plan.documentSectionRows.get(row.id!) ?? [];
      if (sections.length > 0) await tx.insert(documentSections).values(sections);
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
  const source = readNotionExport(options.file);
  console.log(
    `Found ${source.sops.length} procedures, ${source.projects.length} projects, ` +
      `${source.tasks.length} tasks, ${source.team.length} team members, ` +
      `${source.documents.length} documents.`,
  );

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

  await write(planned.plan);
  console.log(`\nDone. Imported into "${planned.plan.organizationName}" (${planned.plan.organizationId}).\n`);
}

main()
  .then(closeDb)
  .catch(async (error) => {
    console.error("\nImport failed:", error);
    await closeDb();
    process.exit(1);
  });
