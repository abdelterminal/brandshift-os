"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { projectMembers, projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { withOrg } from "@/db/tenancy";
import { db } from "@/db/client";
import { requirePermissionForAction } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity";
import { ensureProjectChannel } from "@/lib/data/channels";

/**
 * Creating a project.
 *
 * The guided flow collects everything before writing anything, and then writes
 * it in one transaction: a project with a team but no deliverables, or
 * deliverables attached to a project that failed to save, are both states the
 * rest of the app has no idea how to show.
 */

export type CreateProjectResult =
  { ok: true; key: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, "keyFormat"),
  description: z.string().trim().max(2000).optional(),
  departmentId: z.union([z.uuid(), z.literal("")]).optional(),
  ownerUserId: z.union([z.uuid(), z.literal("")]).optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  /** Team member ids, from the assignment step. */
  memberIds: z.array(z.uuid()).default([]),
  /** One deliverable per line, becoming the project's first tasks. */
  deliverables: z.array(z.string().trim().min(2).max(200)).default([]),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  const session = await requirePermissionForAction("project.create");
  const parsed = createProjectSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field) fieldErrors[field] = issue.message === "keyFormat" ? "keyFormat" : "invalid";
    }
    return { ok: false, error: "invalid", fieldErrors };
  }

  const data = parsed.data;
  const scope = withOrg(session.actor.organizationId);

  // The key is what the URL and the command palette use, so it has to be
  // unique within the organization. Checked before the transaction so the
  // message can name the field rather than surfacing a constraint violation.
  const existing = await scope.selectFields(
    projects,
    { id: projects.id },
    eq(projects.key, data.key),
  );
  if (existing.length > 0) {
    return { ok: false, error: "invalid", fieldErrors: { key: "keyTaken" } };
  }

  const created = await db.transaction(async (tx) => {
    const txScope = withOrg(session.actor.organizationId, tx);

    const [project] = await txScope.insert(projects, {
      key: data.key,
      name: data.name,
      description: data.description || null,
      status: "planning",
      priority: data.priority,
      departmentId: data.departmentId || null,
      ownerUserId: data.ownerUserId || session.actor.userId,
      dueDate: data.dueDate || null,
      createdByUserId: session.actor.userId,
    });

    const owner = data.ownerUserId || session.actor.userId;
    // The owner is always on the team; a project whose owner is not a member
    // of it is a state the Team tab would have to explain.
    const team = [...new Set([owner, ...data.memberIds])];

    await txScope.insert(
      projectMembers,
      team.map((userId) => ({
        projectId: project!.id,
        userId,
        role: userId === owner ? ("lead" as const) : ("contributor" as const),
      })),
    );

    if (data.deliverables.length > 0) {
      await txScope.insert(
        tasks,
        data.deliverables.map((title, index) => ({
          projectId: project!.id,
          title,
          status: "todo" as const,
          priority: data.priority,
          position: index,
          createdByUserId: session.actor.userId,
        })),
      );
    }

    // In the same transaction as the team it is built from, so a project can
    // never exist with members and no place for them to talk.
    await ensureProjectChannel(session.actor, project!, tx);

    return project!;
  });

  await recordActivity(session.actor, {
    verb: "project.created",
    subjectType: "project",
    subjectId: created.id,
    projectId: created.id,
    metadata: { name: created.name, key: created.key },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/work`);
  redirect(`/${locale}/work/${created.key}`);
}

const statusSchema = z.enum(["planning", "active", "on_hold", "completed", "archived"]);

export async function setProjectStatus(
  projectId: string,
  status: z.infer<typeof statusSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermissionForAction("project.create");

  const parsedId = z.uuid().safeParse(projectId);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return { ok: false, error: "notFound" };

  const [updated] = await withOrg(session.actor.organizationId).update(
    projects,
    {
      status: parsedStatus.data,
      completedAt: parsedStatus.data === "completed" ? new Date() : null,
      updatedAt: new Date(),
    },
    eq(projects.id, parsedId.data),
  );

  if (!updated) return { ok: false, error: "notFound" };

  await recordActivity(session.actor, {
    verb: "project.statusChanged",
    subjectType: "project",
    subjectId: updated.id,
    projectId: updated.id,
    metadata: { status: parsedStatus.data },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/work`);
  revalidatePath(`/${locale}/work/${updated.key}`);
  return { ok: true };
}
