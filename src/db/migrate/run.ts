import { eq } from "drizzle-orm";

import { closeDb, db } from "../client";
import {
  activityEvents,
  companies,
  departments,
  memberships,
  organizations,
  projectMembers,
  projects,
  tasks,
  users,
} from "../schema";
import {
  assignRoles,
  dayString,
  departmentDescription,
  deterministicId,
  foldClientName,
  mapEvent,
  mapPriority,
  mapProjectStatus,
  mapTaskStatus,
  personName,
  pickCompanyName,
  projectKey,
  slugify,
  taskDescription,
} from "./map";
import { readSource, type SourceData } from "./read";

/**
 * Move the old app's data into this one.
 *
 * Run it as often as you like. It reads Mongo, works out every row it would
 * write, prints what it could and could not carry, and stops -- unless
 * `--commit` is passed, in which case it writes the lot inside one
 * transaction. Nothing is half-applied: either the whole migration lands or
 * the database is exactly as it was.
 *
 *   npm run db:migrate:mongo -- --uri mongodb://localhost:27017 --org brandshift
 *   npm run db:migrate:mongo -- --uri mongodb://localhost:27017 --org brandshift --commit
 *
 * Every row lands on an id derived from its Mongo `_id` (see `map.ts`), so a
 * second run updates what the first one wrote instead of duplicating it. That
 * is what makes the dry run worth anything: you can rehearse against a copy,
 * read the report, fix what it complains about, and run it again.
 */

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

type Options = {
  uri: string;
  database: string;
  orgSlug: string;
  orgName: string;
  currency: string;
  timezone: string;
  commit: boolean;
};

function parseArgs(argv: string[]): Options | { error: string } {
  const flag = (name: string, fallback?: string) => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    return argv[index + 1];
  };

  const uri = flag("uri");
  if (!uri) return { error: "--uri is required, e.g. --uri mongodb://localhost:27017" };

  return {
    uri,
    database: flag("db", "mediast_db")!,
    orgSlug: flag("org", "brandshift")!,
    orgName: flag("org-name", "BrandShift")!,
    currency: flag("currency", "MAD")!,
    timezone: flag("timezone", "Africa/Casablanca")!,
    commit: argv.includes("--commit"),
  };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * What the migration is going to do, and what it cannot do.
 *
 * The second half is the point. Every field the old schema has and this one
 * does not is counted here and printed, because the failure mode of a
 * migration is not a crash -- it is arriving six months later at "where did
 * the budgets go?" with nobody able to say whether they were dropped on
 * purpose.
 */
class Report {
  readonly carried = new Map<string, number>();
  readonly dropped = new Map<string, { count: number; why: string }>();
  readonly notes: string[] = [];
  readonly warnings: string[] = [];

  carry(what: string, count = 1) {
    this.carried.set(what, (this.carried.get(what) ?? 0) + count);
  }

  drop(what: string, why: string, count = 1) {
    if (count === 0) return;
    const existing = this.dropped.get(what);
    this.dropped.set(what, { count: (existing?.count ?? 0) + count, why });
  }

  note(line: string) {
    this.notes.push(line);
  }

  warn(line: string) {
    this.warnings.push(line);
  }

  print(commit: boolean) {
    const pad = (value: number) => String(value).padStart(5);

    console.log(`\n${commit ? "MIGRATING" : "DRY RUN -- nothing will be written"}\n`);

    console.log("Carried across");
    for (const [what, count] of [...this.carried].sort()) {
      console.log(`  ${pad(count)}  ${what}`);
    }

    if (this.dropped.size > 0) {
      console.log("\nNot carried, and why");
      for (const [what, { count, why }] of [...this.dropped].sort()) {
        console.log(`  ${pad(count)}  ${what}`);
        console.log(`         ${why}`);
      }
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
// Planning: pure, so the dry run and the real run cannot disagree
// ---------------------------------------------------------------------------

/**
 * Every row the migration intends to write, typed by the tables themselves.
 *
 * Taking the shapes from `$inferInsert` rather than describing them again is
 * what makes a column added to the schema next month a type error here, rather
 * than a value quietly missing from the migration.
 */
type Plan = {
  organizationId: string;
  organization: typeof organizations.$inferInsert;
  userRows: (typeof users.$inferInsert)[];
  departmentRows: (typeof departments.$inferInsert)[];
  membershipRows: (typeof memberships.$inferInsert)[];
  companyRows: (typeof companies.$inferInsert)[];
  projectRows: (typeof projects.$inferInsert)[];
  memberRows: (typeof projectMembers.$inferInsert)[];
  taskRows: (typeof tasks.$inferInsert)[];
  eventRows: (typeof activityEvents.$inferInsert)[];
};

function planMigration(
  source: SourceData,
  options: Options,
  report: Report,
): { plan: Plan } | { error: string } {
  const organizationId = deterministicId("organization", options.orgSlug);

  // -- People --------------------------------------------------------------

  const assignment = assignRoles(source.users);
  if ("error" in assignment) return { error: assignment.error };

  report.note(
    `${assignment.founder.email} is the earliest ADMIN, so it becomes the organization's owner.`,
  );

  const userRows = source.users
    .filter((user) => {
      if (user.email) return true;
      report.drop("user with no email address", "There is nothing to sign in with.", 1);
      return false;
    })
    .map((user) => ({
      id: deterministicId("user", user.id),
      email: user.email,
      // Django's PBKDF2, which `verifyPassword` reads and sign-in upgrades to
      // scrypt on first use. Nobody has to reset anything.
      passwordHash: user.passwordHash,
      name: personName(user.firstName, user.lastName) || user.email,
      createdAt: user.createdAt ?? new Date(),
    }));

  report.carry("people", userRows.length);

  const departmentRows: (typeof departments.$inferInsert)[] = [];

  const usedSlugs = new Set<string>();
  for (const department of source.departments) {
    let slug = slugify(department.name, "department");
    let suffix = 2;
    while (usedSlugs.has(slug)) slug = `${slugify(department.name, "department")}-${suffix++}`;
    usedSlugs.add(slug);

    departmentRows.push({
      id: deterministicId("department", department.id),
      organizationId,
      slug,
      name: department.name,
      description: departmentDescription(department.subtitle, department.description),
    });
  }

  report.carry("departments", departmentRows.length);
  report.drop(
    "department icons and images",
    "This app has no file storage yet, and a base64 image in a text column is not storage.",
    source.departments.filter((d) => d.hasIcon || d.hasImage).length,
  );

  const membershipRows = source.users
    .filter((user) => user.email)
    .map((user) => {
      const role = assignment.roles.get(user.email) ?? "member";
      return {
        id: deterministicId("membership", user.id),
        organizationId,
        userId: deterministicId("user", user.id),
        departmentId: user.departmentId ? deterministicId("department", user.departmentId) : null,
        role,
        // The old ADMIN could see everything, so the owner keeps every module.
        // Nobody else gains anything: `EMPLOYEE` had no modules to inherit, and
        // a migration must never hand out a permission nobody granted.
        permissions:
          role === "owner" ? { finance: true, people: true, crm: true, insights: true } : {},
        status: "active" as const,
        isFounder: role === "owner",
        joinedAt: user.createdAt ?? new Date(),
      };
    });

  // -- Clients, which become companies -------------------------------------

  const clientSpellings = new Map<string, string[]>();
  for (const project of source.projects) {
    const client = project.client?.trim();
    if (!client) continue;
    const fold = foldClientName(client);
    if (!fold) continue;
    clientSpellings.set(fold, [...(clientSpellings.get(fold) ?? []), client]);
  }

  const companyRows: (typeof companies.$inferInsert)[] = [];
  const companyByFold = new Map<string, string>();

  const usedCompanySlugs = new Set<string>();
  for (const [fold, spellings] of [...clientSpellings].sort()) {
    const name = pickCompanyName(spellings);
    const id = deterministicId("company", fold);

    let slug = slugify(name, fold);
    let suffix = 2;
    while (usedCompanySlugs.has(slug)) slug = `${slugify(name, fold)}-${suffix++}`;
    usedCompanySlugs.add(slug);

    companyRows.push({
      id,
      organizationId,
      name,
      slug,
      // They have projects, so they are clients rather than prospects.
      status: "client" as const,
    });
    companyByFold.set(fold, id);

    const distinct = [...new Set(spellings.map((s) => s.trim()))];
    if (distinct.length > 1) {
      report.note(
        `Merged ${distinct.map((s) => `"${s}"`).join(" and ")} into one company, "${name}".`,
      );
    }
  }

  report.carry("companies, from the free-text client on each project", companyRows.length);

  // -- Projects and tasks ---------------------------------------------------

  const usersByMongoId = new Map(source.users.map((user) => [user.id, user]));
  const firstNames = new Map<string, string[]>();
  for (const user of source.users) {
    const first = (user.firstName ?? "").trim().toLowerCase();
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), user.id]);
  }

  const takenKeys = new Set<string>();
  const projectRows: (typeof projects.$inferInsert)[] = [];
  const memberRows: (typeof projectMembers.$inferInsert)[] = [];
  const taskRows: (typeof tasks.$inferInsert)[] = [];
  const projectIds = new Set<string>();
  const taskIds = new Set<string>();

  let unresolvedOwners = 0;
  let droppedProgress = 0;
  let cancelledProjects = 0;

  for (const project of source.projects) {
    const id = deterministicId("project", project.id);
    projectIds.add(id);

    // The old `owner` is a first name somebody typed, not a reference. It is
    // resolved only when exactly one person answers to it -- two Youssefs and
    // the field is ambiguous, and guessing which one owns the work is not a
    // thing a migration gets to do.
    const candidates = firstNames.get((project.owner ?? "").trim().toLowerCase()) ?? [];
    const ownerMongoId = candidates.length === 1 ? candidates[0] : null;
    if (project.owner && !ownerMongoId) unresolvedOwners += 1;

    const status = mapProjectStatus(project.status);
    if ((project.status ?? "").toUpperCase() === "CANCELLED") cancelledProjects += 1;

    projectRows.push({
      id,
      organizationId,
      key: projectKey(project.name, takenKeys),
      name: project.name,
      description: project.description?.trim() || null,
      status,
      priority: mapPriority(project.priority),
      departmentId: project.departmentId
        ? deterministicId("department", project.departmentId)
        : null,
      ownerUserId: ownerMongoId ? deterministicId("user", ownerMongoId) : null,
      startDate: dayString(project.startDate),
      dueDate: dayString(project.deadline),
      createdAt: project.startDate ?? new Date(),
      archivedAt: status === "archived" ? new Date() : null,
    });

    const seenMembers = new Set<string>();
    for (const employeeId of project.employeeIds) {
      if (!usersByMongoId.has(employeeId) || seenMembers.has(employeeId)) continue;
      seenMembers.add(employeeId);
      memberRows.push({
        id: deterministicId("project-member", `${project.id}:${employeeId}`),
        organizationId,
        projectId: id,
        userId: deterministicId("user", employeeId),
        role: employeeId === ownerMongoId ? "lead" : "contributor",
      });
    }

    project.tasks.forEach((task, index) => {
      const taskId = deterministicId("task", `${project.id}:${task.id}`);
      taskIds.add(taskId);

      if (typeof task.progress === "number" && task.progress > 0) droppedProgress += 1;

      const status = mapTaskStatus(task.status, task.isArchived);

      taskRows.push({
        id: taskId,
        organizationId,
        projectId: id,
        title: task.title,
        description: taskDescription({
          description: task.description,
          note: task.note,
          rejectionReason: task.rejectionReason,
        }),
        status,
        priority: mapPriority(task.priority),
        assigneeUserId:
          task.assignedToId && usersByMongoId.has(task.assignedToId)
            ? deterministicId("user", task.assignedToId)
            : null,
        dueDate: dayString(task.deadline),
        position: index,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        blockedReason: status === "blocked" ? (task.rejectionReason?.trim() ?? null) : null,
        blockedAt: status === "blocked" ? (task.assignedAt ?? new Date()) : null,
        createdAt: task.assignedAt ?? project.startDate ?? new Date(),
      });
    });
  }

  report.carry("projects", projectRows.length);
  report.carry("tasks", taskRows.length);
  report.carry("project memberships", memberRows.length);

  report.drop(
    "project budgets",
    'A free-text string like "10000" with no currency. Money here is integer cents on a quote or an invoice, and turning a note into a financial document would be inventing one.',
    source.projects.filter((p) => p.budget?.trim()).length,
  );
  report.drop(
    "project durations",
    'Free text such as "4 days". The start date and deadline carry the real thing.',
    source.projects.filter((p) => p.duration?.trim()).length,
  );
  report.drop(
    "project tags",
    "A mix of client names and department names, both of which are now real columns pointing at real rows.",
    source.projects.filter((p) => p.tags.length > 0).length,
  );
  report.drop(
    "task progress percentages",
    "There is no percent-complete here: a task is todo, in progress, blocked, done or cancelled. A number nobody updates is worse than no number.",
    droppedProgress,
  );

  if (unresolvedOwners > 0) {
    report.warn(
      `${unresolvedOwners} project(s) name an owner that matches no single person; they land with no owner set.`,
    );
  }
  if (cancelledProjects > 0) {
    report.warn(
      `${cancelledProjects} cancelled project(s) become archived -- this app has no cancelled project, and the two are not the same sentence.`,
    );
  }

  // -- Activity -------------------------------------------------------------

  const eventRows: (typeof activityEvents.$inferInsert)[] = [];
  let unknownVerbs = 0;
  let orphanEvents = 0;

  for (const event of source.events) {
    const mapped = mapEvent(event.eventType);
    if (!mapped) {
      unknownVerbs += 1;
      continue;
    }

    const projectId = event.projectId ? deterministicId("project", event.projectId) : null;
    if (!projectId || !projectIds.has(projectId)) {
      orphanEvents += 1;
      continue;
    }

    const taskId =
      event.taskId && event.projectId
        ? deterministicId("task", `${event.projectId}:${event.taskId}`)
        : null;
    const resolvedTaskId = taskId && taskIds.has(taskId) ? taskId : null;

    // An event about a task whose task is gone is filed against the project,
    // which is where somebody would go looking for it anyway.
    const subjectIsTask = mapped.subject === "task" && resolvedTaskId;

    eventRows.push({
      id: deterministicId("activity", event.id),
      organizationId,
      actorUserId:
        event.actorId && usersByMongoId.has(event.actorId)
          ? deterministicId("user", event.actorId)
          : null,
      verb: mapped.verb,
      subjectType: subjectIsTask ? "task" : "project",
      subjectId: subjectIsTask ? resolvedTaskId : projectId,
      projectId,
      taskId: resolvedTaskId,
      metadata: {
        ...event.metadata,
        ...(event.taskTitle ? { title: event.taskTitle } : {}),
        migratedFrom: "brandshiftsaas",
      },
      createdAt: event.createdAt ?? new Date(),
    });
  }

  report.carry("activity events", eventRows.length);
  report.drop(
    "activity events with a verb this app does not have",
    "Storing them under an invented verb would put rows in the feed that nothing knows how to render.",
    unknownVerbs,
  );
  report.drop(
    "activity events whose project no longer resolves",
    "The project they point at is not in the source data, so the event has nothing to be about.",
    orphanEvents,
  );

  // -- What the old app has and this one does not --------------------------

  report.drop(
    "sign-in sessions",
    "Sessions are not portable: the token format, the secret and the digest are all different. Everybody signs in once, with the password they already had.",
    source.notCarried.sessions,
  );
  report.drop(
    "attendance records",
    "There is no timeclock here -- attendance means who is away, derived from approved leave. Recorded in KNOWN-GAPS.md.",
    source.notCarried.attendance,
  );
  report.drop(
    "lunch records",
    "Same as attendance: nothing clocks in or out, so there is nowhere for these to go.",
    source.notCarried.lunch,
  );
  report.drop(
    "direct messages",
    "This app has channels, not one-to-one messages. Turning each pair of people into a private channel would invent a structure nobody asked for.",
    source.notCarried.messages,
  );
  report.drop(
    "meetings",
    "The old meeting has a start and no end, no organizer response and no location. Where there are any to carry, they need a default duration somebody has to choose.",
    source.notCarried.meetings,
  );

  return {
    plan: {
      organizationId,
      organization: {
        id: organizationId,
        slug: options.orgSlug,
        name: options.orgName,
        currency: options.currency,
        timezone: options.timezone,
      },
      userRows,
      departmentRows,
      membershipRows,
      companyRows,
      projectRows,
      memberRows,
      taskRows,
      eventRows,
    },
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * One transaction, in dependency order.
 *
 * Every insert is `onConflictDoUpdate` on the primary key, because the ids are
 * derived: running twice converges on the same rows rather than failing on a
 * duplicate or, worse, writing a second copy of everything.
 */
async function write(plan: Plan) {
  await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values(plan.organization)
      .onConflictDoUpdate({ target: organizations.id, set: { name: plan.organization.name } });

    for (const row of plan.userRows) {
      await tx
        .insert(users)
        .values(row)
        .onConflictDoUpdate({
          target: users.id,
          set: { name: row.name, email: row.email, passwordHash: row.passwordHash },
        });
    }

    for (const row of plan.departmentRows) {
      await tx
        .insert(departments)
        .values(row)
        .onConflictDoUpdate({
          target: departments.id,
          set: { name: row.name, slug: row.slug, description: row.description },
        });
    }

    for (const row of plan.membershipRows) {
      await tx
        .insert(memberships)
        .values(row)
        .onConflictDoUpdate({
          target: memberships.id,
          set: {
            role: row.role,
            departmentId: row.departmentId,
            permissions: row.permissions,
            status: row.status,
          },
        });
    }

    for (const row of plan.companyRows) {
      await tx
        .insert(companies)
        .values(row)
        .onConflictDoUpdate({
          target: companies.id,
          set: { name: row.name, slug: row.slug, status: row.status },
        });
    }

    for (const row of plan.projectRows) {
      await tx
        .insert(projects)
        .values(row)
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            key: row.key,
            name: row.name,
            status: row.status,
            priority: row.priority,
            description: row.description,
            departmentId: row.departmentId,
            ownerUserId: row.ownerUserId,
            startDate: row.startDate,
            dueDate: row.dueDate,
          },
        });
    }

    for (const row of plan.memberRows) {
      await tx
        .insert(projectMembers)
        .values(row)
        .onConflictDoUpdate({ target: projectMembers.id, set: { role: row.role } });
    }

    for (const row of plan.taskRows) {
      await tx
        .insert(tasks)
        .values(row)
        .onConflictDoUpdate({
          target: tasks.id,
          set: {
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            assigneeUserId: row.assigneeUserId,
            dueDate: row.dueDate,
            position: row.position,
          },
        });
    }

    for (const row of plan.eventRows) {
      await tx
        .insert(activityEvents)
        .values(row)
        .onConflictDoUpdate({
          target: activityEvents.id,
          set: { verb: row.verb, metadata: row.metadata },
        });
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

  console.log(`Reading ${options.database} at ${options.uri.replace(/\/\/[^@]+@/, "//***@")}`);
  const source = await readSource(options.uri, options.database);

  const report = new Report();
  const planned = planMigration(source, options, report);

  if ("error" in planned) {
    console.error(`\nRefusing to migrate: ${planned.error}`);
    process.exit(1);
  }

  report.print(options.commit);

  if (!options.commit) {
    console.log("\nNothing was written. Re-run with --commit to apply.\n");
    return;
  }

  // An organization that already holds rows is the one case worth stopping
  // for: this writes into it, and merging a migration into live data is a
  // decision somebody has to make deliberately rather than discover.
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, planned.plan.organizationId))
    .limit(1);

  if (existing.length > 0) {
    console.log("\nThis organization already has projects; re-running updates the rows it wrote.");
  }

  await write(planned.plan);
  console.log(`\nDone. Organization ${planned.plan.organizationId}.`);
  console.log("Everyone signs in with the password they already had.\n");
}

main()
  .then(closeDb)
  .catch(async (error) => {
    console.error("\nMigration failed:", error);
    await closeDb();
    process.exit(1);
  });
