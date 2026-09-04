"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import {
  archiveTemplate,
  createTemplate,
  getTemplateById,
  replaceTemplateTasks,
  startProject,
  templateFromProject,
  templateFromSop,
} from "@/lib/data/templates";
import { parseOffset, type TemplateTaskShape } from "@/lib/templates";

/**
 * Writing templates, and starting real work from one.
 *
 * The offset field is the one that needs care. Blank means "no deadline",
 * which is a real answer; anything that is not a whole number of days is
 * refused rather than read as zero, because zero would silently put a deadline
 * on the first day of every project started from the template.
 */

export type ActionResult = { ok: true; id?: string; slug?: string } | { ok: false; error: string };

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  /** A string, because the form's empty value is meaningful. */
  offsetDays: z.string().trim(),
});

function parseTasks(
  raw: z.infer<typeof taskSchema>[],
): { ok: true; tasks: TemplateTaskShape[] } | { ok: false; error: string } {
  const tasks: TemplateTaskShape[] = [];

  for (const task of raw) {
    const offset = parseOffset(task.offsetDays);
    if (!offset.ok) return { ok: false, error: "offset" };

    tasks.push({
      title: task.title,
      description: task.description || null,
      priority: task.priority,
      offsetDays: offset.value,
    });
  }

  if (tasks.length === 0) return { ok: false, error: "noTasks" };
  return { ok: true, tasks };
}

async function revalidateTemplates() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  tasks: z.array(taskSchema).min(1).max(60),
});

export async function addTemplate(input: z.input<typeof templateSchema>): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const tasks = parseTasks(parsed.data.tasks);
  if (!tasks.ok) return { ok: false, error: tasks.error };

  const session = await requirePermissionForAction("template.manage");

  const created = await createTemplate(session.actor, {
    name: parsed.data.name,
    description: parsed.data.description || null,
    departmentId: parsed.data.departmentId || null,
    tasks: tasks.tasks,
  });
  if (!created) return { ok: false, error: "invalid" };

  await recordActivity(session.actor, {
    verb: "template.created",
    subjectType: "template",
    subjectId: created.id,
    metadata: { title: parsed.data.name },
  });

  const locale = await getLocale();
  await revalidateTemplates();
  redirect(`/${locale}/templates/${created.slug}`);
}

const tasksSchema = z.object({
  templateId: z.uuid(),
  tasks: z.array(taskSchema).min(1).max(60),
});

export async function updateTemplateTasks(
  input: z.input<typeof tasksSchema>,
): Promise<ActionResult> {
  const parsed = tasksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const tasks = parseTasks(parsed.data.tasks);
  if (!tasks.ok) return { ok: false, error: tasks.error };

  const session = await requirePermissionForAction("template.manage");

  const done = await replaceTemplateTasks(session.actor, parsed.data.templateId, tasks.tasks);
  if (!done) return { ok: false, error: "notFound" };

  await revalidateTemplates();
  return { ok: true };
}

const startSchema = z.object({
  templateId: z.uuid(),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, "keyFormat"),
  name: z.string().trim().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Turn a template into a project.
 *
 * Not called `useTemplate`, however much it reads better: a `use` prefix makes
 * eslint treat it as a React hook, and a Server Action is not one.
 *
 * Needs `project.create` rather than `template.manage`: reading a template and
 * starting work from it are different privileges from writing one, and the
 * person who runs the job is not always the person who wrote down how.
 */
export async function startFromTemplate(input: z.input<typeof startSchema>): Promise<ActionResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "keyFormat" };

  const session = await requirePermissionForAction("project.create");

  const started = await startProject(session.actor, {
    templateId: parsed.data.templateId,
    key: parsed.data.key,
    name: parsed.data.name,
    startDate: parsed.data.startDate,
  });

  if (started === "keyTaken") return { ok: false, error: "keyTaken" };
  if (!started) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "project.created",
    subjectType: "project",
    subjectId: started.id,
    projectId: started.id,
    metadata: { key: started.key, name: parsed.data.name },
  });

  const locale = await getLocale();
  await revalidateTemplates();
  redirect(`/${locale}/work/${started.key}`);
}

const captureSchema = z.object({
  sourceId: z.uuid(),
  name: z.string().trim().min(1).max(200),
});

/** A procedure becomes a starting template. Steps in, no schedule. */
export async function captureFromSop(input: z.input<typeof captureSchema>): Promise<ActionResult> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("template.manage");

  const created = await templateFromSop(session.actor, parsed.data.sourceId, parsed.data.name);
  if (!created) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "template.created",
    subjectType: "template",
    subjectId: created.id,
    metadata: { title: parsed.data.name },
  });

  const locale = await getLocale();
  await revalidateTemplates();
  redirect(`/${locale}/templates/${created.slug}`);
}

/** A project that went well becomes a template. Shape in, calendar out. */
export async function captureFromProject(
  input: z.input<typeof captureSchema>,
): Promise<ActionResult> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("template.manage");

  const created = await templateFromProject(session.actor, parsed.data.sourceId, parsed.data.name);
  if (!created) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "template.created",
    subjectType: "template",
    subjectId: created.id,
    metadata: { title: parsed.data.name },
  });

  const locale = await getLocale();
  await revalidateTemplates();
  redirect(`/${locale}/templates/${created.slug}`);
}

export async function retireTemplate(templateId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(templateId);
  if (!id.success) return { ok: false, error: "notFound" };

  const session = await requirePermissionForAction("template.manage");

  const template = await getTemplateById(session.actor, id.data);
  if (!template) return { ok: false, error: "notFound" };

  const done = await archiveTemplate(session.actor, id.data);
  if (!done) return { ok: false, error: "alreadyThere" };

  await revalidateTemplates();
  return { ok: true };
}
