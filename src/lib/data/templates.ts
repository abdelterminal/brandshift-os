import "server-only";

import { eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  departments,
  projectMembers,
  projectTemplates,
  projects,
  sopSteps,
  sops,
  tasks,
  templateTasks,
  users,
} from "@/db/schema";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import { slugify } from "@/lib/slug";
import {
  fromProjectTasks,
  fromSopSteps,
  scheduleFor,
  templateSpanDays,
  type TemplateTaskShape,
} from "@/lib/templates";

/**
 * Reading templates, and turning one into a real project.
 *
 * The third path in this app from a definition to tasks -- after a quote's
 * lines and an SOP's steps -- and the one that carries a schedule as well as a
 * list. `startProject` deliberately mirrors `createProjectFromQuote`: one
 * transaction, the project and its member and its tasks, or nothing.
 */

export type TemplateTaskView = TemplateTaskShape & { id: string; position: number };

export type TemplateView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdByName: string | null;
  createdAt: Date;
  tasks: TemplateTaskView[];
  spanDays: number | null;
};

const TEMPLATE_FIELDS = {
  id: projectTemplates.id,
  slug: projectTemplates.slug,
  name: projectTemplates.name,
  description: projectTemplates.description,
  departmentId: projectTemplates.departmentId,
  departmentName: departments.name,
  createdByName: users.name,
  createdAt: projectTemplates.createdAt,
};

const TEMPLATE_JOINS = [
  { table: users, on: eq(projectTemplates.createdByUserId, users.id), type: "left" as const },
  {
    table: departments,
    on: eq(projectTemplates.departmentId, departments.id),
    type: "left" as const,
  },
];

async function decorate(
  actor: Actor,
  rows: Array<Omit<TemplateView, "tasks" | "spanDays">>,
): Promise<TemplateView[]> {
  if (rows.length === 0) return [];

  const steps = await withOrg(actor.organizationId).select(
    templateTasks,
    inArray(
      templateTasks.templateId,
      rows.map((row) => row.id),
    ),
  );

  return rows
    .map((row) => {
      const mine = steps
        .filter((step) => step.templateId === row.id)
        .sort((a, b) => a.position - b.position)
        .map((step) => ({
          id: step.id,
          position: step.position,
          title: step.title,
          description: step.description,
          priority: step.priority,
          offsetDays: step.offsetDays,
        }));

      return { ...row, tasks: mine, spanDays: templateSpanDays(mine) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTemplates(actor: Actor): Promise<TemplateView[]> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    projectTemplates,
    TEMPLATE_FIELDS,
    TEMPLATE_JOINS,
    isNull(projectTemplates.archivedAt),
  );

  return decorate(actor, rows);
}

export async function getTemplate(actor: Actor, slug: string): Promise<TemplateView | null> {
  const rows = await withOrg(actor.organizationId).selectJoined(
    projectTemplates,
    TEMPLATE_FIELDS,
    TEMPLATE_JOINS,
    eq(projectTemplates.slug, slug),
  );

  const [view] = await decorate(actor, rows);
  return view ?? null;
}

export async function getTemplateById(actor: Actor, templateId: string) {
  const [row] = await withOrg(actor.organizationId).select(
    projectTemplates,
    eq(projectTemplates.id, templateId),
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function uniqueSlug(actor: Actor, name: string): Promise<string> {
  const base = slugify(name, "template");
  const existing = await withOrg(actor.organizationId).selectFields(projectTemplates, {
    slug: projectTemplates.slug,
  });
  const taken = new Set(existing.map((row) => row.slug));

  if (!taken.has(base)) return base;

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error(`Could not find a free slug for "${name}"`);
}

export async function createTemplate(
  actor: Actor,
  input: {
    name: string;
    description: string | null;
    departmentId: string | null;
    tasks: TemplateTaskShape[];
  },
): Promise<{ id: string; slug: string } | null> {
  const slug = await uniqueSlug(actor, input.name);

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [created] = await scope.insert(projectTemplates, {
      slug,
      name: input.name,
      description: input.description,
      departmentId: input.departmentId,
      createdByUserId: actor.userId,
    });
    if (!created) return null;

    if (input.tasks.length > 0) {
      await scope.insert(
        templateTasks,
        input.tasks.map((task, index) => ({
          templateId: created.id,
          position: index,
          title: task.title,
          description: task.description,
          priority: task.priority,
          offsetDays: task.offsetDays,
        })),
      );
    }

    return { id: created.id, slug: created.slug };
  });
}

export async function replaceTemplateTasks(
  actor: Actor,
  templateId: string,
  list: TemplateTaskShape[],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const [template] = await scope.select(projectTemplates, eq(projectTemplates.id, templateId));
    if (!template) return false;

    await scope.delete(templateTasks, eq(templateTasks.templateId, templateId));

    if (list.length > 0) {
      await scope.insert(
        templateTasks,
        list.map((task, index) => ({
          templateId,
          position: index,
          title: task.title,
          description: task.description,
          priority: task.priority,
          offsetDays: task.offsetDays,
        })),
      );
    }

    await scope.update(
      projectTemplates,
      { updatedAt: new Date() },
      eq(projectTemplates.id, templateId),
    );
    return true;
  });
}

export async function archiveTemplate(actor: Actor, templateId: string): Promise<boolean> {
  const updated = await withOrg(actor.organizationId).update(
    projectTemplates,
    { archivedAt: new Date(), updatedAt: new Date() },
    eq(projectTemplates.id, templateId),
    isNull(projectTemplates.archivedAt),
  );

  return updated.length > 0;
}

// ---------------------------------------------------------------------------
// The two capture paths
// ---------------------------------------------------------------------------

/**
 * A procedure, as a starting template.
 *
 * The link the SOP milestone was built to make possible: a step becomes a
 * task, exactly as a quote line already does. No schedule comes across --
 * `fromSopSteps` explains why.
 */
export async function templateFromSop(
  actor: Actor,
  sopId: string,
  name: string,
): Promise<{ id: string; slug: string } | null> {
  const [sop] = await withOrg(actor.organizationId).select(sops, eq(sops.id, sopId));
  if (!sop) return null;

  const steps = await withOrg(actor.organizationId).select(sopSteps, eq(sopSteps.sopId, sopId));

  const ordered = steps
    .sort((a, b) => a.position - b.position)
    .map((step) => ({ title: step.title, detail: step.detail }));

  return createTemplate(actor, {
    name,
    description: sop.summary,
    departmentId: sop.departmentId,
    tasks: fromSopSteps(ordered),
  });
}

/**
 * A project that went well, as a template.
 *
 * Keeps the shape rather than the calendar: each task's deadline becomes an
 * offset from the project's start, so the same schedule can be run again from
 * any date. Cancelled tasks are left out -- work somebody decided not to do is
 * not part of how the job is done.
 */
export async function templateFromProject(
  actor: Actor,
  projectId: string,
  name: string,
): Promise<{ id: string; slug: string } | null> {
  const [project] = await withOrg(actor.organizationId).select(
    projects,
    eq(projects.id, projectId),
  );
  if (!project) return null;

  const rows = await withOrg(actor.organizationId).select(tasks, eq(tasks.projectId, projectId));

  const ordered = rows
    .filter((task) => task.status !== "cancelled")
    .sort((a, b) => a.position - b.position)
    .map((task) => ({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
    }));

  return createTemplate(actor, {
    name,
    description: project.description,
    departmentId: project.departmentId,
    tasks: fromProjectTasks(project.startDate, ordered),
  });
}

// ---------------------------------------------------------------------------
// Using one
// ---------------------------------------------------------------------------

/**
 * Start a real project from a template.
 *
 * Mirrors `createProjectFromQuote` on purpose: one transaction covering the
 * project, its first member and every task, so a half-created project is not
 * a state anybody can reach. The difference is the schedule -- every task's
 * deadline is worked out from the start date the caller chose.
 */
export async function startProject(
  actor: Actor,
  input: { templateId: string; key: string; name: string; startDate: string },
): Promise<{ id: string; key: string } | null | "keyTaken"> {
  const template = await getTemplateById(actor, input.templateId);
  if (!template) return null;

  const list = await withOrg(actor.organizationId).select(
    templateTasks,
    eq(templateTasks.templateId, input.templateId),
  );

  const scheduled = scheduleFor(
    input.startDate,
    list
      .sort((a, b) => a.position - b.position)
      .map((task) => ({
        title: task.title,
        description: task.description,
        priority: task.priority,
        offsetDays: task.offsetDays,
      })),
  );

  return db.transaction(async (tx) => {
    const scope = withOrg(actor.organizationId, tx);

    const clash = await scope.selectFields(
      projects,
      { id: projects.id },
      eq(projects.key, input.key),
    );
    if (clash.length > 0) return "keyTaken" as const;

    const [project] = await scope.insert(projects, {
      key: input.key,
      name: input.name,
      description: template.description,
      status: "planning" as const,
      priority: "medium" as const,
      departmentId: template.departmentId,
      ownerUserId: actor.userId,
      createdByUserId: actor.userId,
      startDate: input.startDate,
      // The project's own deadline is the last task's, which is what the
      // template said the job takes.
      dueDate:
        scheduled.reduce<string | null>(
          (latest, task) =>
            task.dueDate && (!latest || task.dueDate > latest) ? task.dueDate : latest,
          null,
        ) ?? null,
    });
    if (!project) return null;

    await scope.insert(projectMembers, {
      projectId: project.id,
      userId: actor.userId,
      role: "lead" as const,
    });

    if (scheduled.length > 0) {
      await scope.insert(
        tasks,
        scheduled.map((task, position) => ({
          projectId: project.id,
          title: task.title.slice(0, 200),
          description: task.description,
          status: "todo" as const,
          priority: task.priority,
          dueDate: task.dueDate,
          position,
          createdByUserId: actor.userId,
        })),
      );
    }

    return { id: project.id, key: project.key };
  });
}
