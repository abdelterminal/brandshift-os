import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { documents } from "@/db/schema/documents";
import { projectStageSetup, stagePlaybook } from "@/db/schema/playbook";
import { projects } from "@/db/schema/projects";
import { tasks } from "@/db/schema/tasks";
import { projectTemplates, templateTasks } from "@/db/schema/templates";
import { withOrg } from "@/db/tenancy";
import type { Actor } from "@/lib/authz";
import type { DocumentKind } from "@/lib/data/document-kinds";
import { uniqueDocumentSlug } from "@/lib/data/documents";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/data/pipeline-stages";
import { sopForStage } from "@/lib/data/sops";
import { organizationToday } from "@/lib/data/tasks";
import { scheduleFor } from "@/lib/templates";
import { isUuid } from "@/lib/uuid";

/**
 * The playbook: what reaching a stage sets up.
 *
 * One row per stage configures a task template and a set of expected document
 * kinds. `setUpStage` runs that configuration against a real project -- once,
 * tracked by `project_stage_setup` -- and the same instantiation code is what
 * the project wizard calls when a project is started straight onto the flow.
 */

export type PlaybookRow = {
  stage: ProjectStage;
  sop: { slug: string; title: string } | null;
  templateId: string | null;
  templateName: string | null;
  docKinds: DocumentKind[];
};

/** All eight stages, each with its procedure, template and expected documents. */
export async function getPlaybook(actor: Actor): Promise<PlaybookRow[]> {
  const scope = withOrg(actor.organizationId);

  const [config, procedures] = await Promise.all([
    scope.selectJoined(
      stagePlaybook,
      {
        stage: stagePlaybook.stage,
        templateId: stagePlaybook.templateId,
        templateName: projectTemplates.name,
        docKinds: stagePlaybook.expectedDocKinds,
      },
      [
        {
          table: projectTemplates,
          on: eq(projectTemplates.id, stagePlaybook.templateId),
          type: "left" as const,
        },
      ],
    ),
    Promise.all(PROJECT_STAGES.map((stage) => sopForStage(actor, stage))),
  ]);

  const byStage = new Map(config.map((row) => [row.stage as ProjectStage, row]));

  return PROJECT_STAGES.map((stage, index) => {
    const row = byStage.get(stage);
    const procedure = procedures[index];
    return {
      stage,
      sop: procedure ? { slug: procedure.slug, title: procedure.title } : null,
      templateId: row?.templateId ?? null,
      templateName: row?.templateName ?? null,
      docKinds: (row?.docKinds ?? []) as DocumentKind[],
    };
  });
}

export async function setStagePlaybook(
  actor: Actor,
  stage: ProjectStage,
  input: { templateId: string | null; docKinds: DocumentKind[] },
): Promise<void> {
  const scope = withOrg(actor.organizationId);

  const [existing] = await scope.selectFields(
    stagePlaybook,
    { id: stagePlaybook.id },
    eq(stagePlaybook.stage, stage),
  );

  if (existing) {
    await scope.update(
      stagePlaybook,
      { templateId: input.templateId, expectedDocKinds: input.docKinds, updatedAt: new Date() },
      eq(stagePlaybook.id, existing.id),
    );
  } else {
    await scope.insert(stagePlaybook, {
      stage,
      templateId: input.templateId,
      expectedDocKinds: input.docKinds,
      createdByUserId: actor.userId,
    });
  }
}

/** Which of a project's stages have already been instantiated. */
export async function stageSetupFor(actor: Actor, projectId: string): Promise<Set<ProjectStage>> {
  if (!isUuid(projectId)) return new Set();
  const rows = await withOrg(actor.organizationId).selectFields(
    projectStageSetup,
    { stage: projectStageSetup.stage },
    eq(projectStageSetup.projectId, projectId),
  );
  return new Set(rows.map((row) => row.stage as ProjectStage));
}

export type SetUpStageResult =
  | { ok: true; taskCount: number; documentCount: number }
  | { ok: false; reason: "notConfigured" | "alreadyDone" | "notFound" };

/**
 * Instantiate a stage for a project: its template's tasks on the schedule, a
 * blank document per expected kind, and the marker row. One transaction.
 *
 * `todayIso` is the anchor for the task schedule -- a stage's clock starts the
 * day you enter it, not the day the project began. Passed in so the caller
 * (which knows the org's timezone) decides "today", and so the wizard can pass
 * the project's own start date instead.
 */
export async function setUpStage(
  actor: Actor,
  projectId: string,
  stage: ProjectStage,
  anchorIso: string = organizationToday(),
): Promise<SetUpStageResult> {
  if (!isUuid(projectId)) return { ok: false, reason: "notFound" };

  const scope = withOrg(actor.organizationId);

  const [project] = await scope.selectFields(
    projects,
    { id: projects.id, name: projects.name },
    eq(projects.id, projectId),
  );
  if (!project) return { ok: false, reason: "notFound" };

  const [config] = await scope.selectFields(
    stagePlaybook,
    { templateId: stagePlaybook.templateId, docKinds: stagePlaybook.expectedDocKinds },
    eq(stagePlaybook.stage, stage),
  );
  if (!config) return { ok: false, reason: "notConfigured" };

  const done = await scope.selectFields(
    projectStageSetup,
    { id: projectStageSetup.id },
    eq(projectStageSetup.projectId, projectId),
    eq(projectStageSetup.stage, stage),
  );
  if (done.length > 0) return { ok: false, reason: "alreadyDone" };

  // Slugs are resolved before the transaction opens -- `uniqueDocumentSlug`
  // reads outside it -- with a running set so two stubs in the same run do not
  // collide.
  const kinds = (config.docKinds ?? []) as DocumentKind[];
  const stubs: { slug: string; title: string; kind: DocumentKind }[] = [];
  for (const kind of kinds) {
    const title = `${documentStubTitle(kind)} — ${project.name}`.slice(0, 200);
    stubs.push({ slug: await uniqueDocumentSlug(actor, title), title, kind });
  }

  return db.transaction(async (tx) => {
    const txScope = withOrg(actor.organizationId, tx);

    const counts = await instantiateStage(txScope, {
      projectId,
      templateId: config.templateId,
      anchorIso,
      stubs,
      actorUserId: actor.userId,
    });

    await txScope.insert(projectStageSetup, {
      projectId,
      stage,
      taskCount: counts.taskCount,
      documentCount: counts.documentCount,
      setUpByUserId: actor.userId,
    });

    return { ok: true, ...counts };
  });
}

/**
 * The write half, shared by `setUpStage` and the project wizard. `scope` is a
 * `withOrg` bound to the caller's transaction; the caller writes the
 * `project_stage_setup` marker itself (the wizard also writes the project in
 * the same transaction).
 */
export async function instantiateStage(
  scope: ReturnType<typeof withOrg>,
  input: {
    projectId: string;
    templateId: string | null;
    anchorIso: string;
    stubs: { slug: string; title: string; kind: DocumentKind }[];
    actorUserId: string;
  },
): Promise<{ taskCount: number; documentCount: number }> {
  let taskCount = 0;

  if (input.templateId) {
    const list = await scope.select(
      templateTasks,
      eq(templateTasks.templateId, input.templateId),
    );

    const scheduled = scheduleFor(
      input.anchorIso,
      list
        .sort((a, b) => a.position - b.position)
        .map((task) => ({
          title: task.title,
          description: task.description,
          priority: task.priority,
          offsetDays: task.offsetDays,
        })),
    );

    if (scheduled.length > 0) {
      // New tasks land after whatever the project already has.
      const existing = await scope.selectFields(
        tasks,
        { position: tasks.position },
        eq(tasks.projectId, input.projectId),
      );
      const base = existing.reduce((m, r) => Math.max(m, r.position ?? 0), 0);

      await scope.insert(
        tasks,
        scheduled.map((task, i) => ({
          projectId: input.projectId,
          title: task.title.slice(0, 200),
          description: task.description,
          status: "todo" as const,
          priority: task.priority,
          dueDate: task.dueDate,
          position: base + 1 + i,
          createdByUserId: input.actorUserId,
        })),
      );
      taskCount = scheduled.length;
    }
  }

  if (input.stubs.length > 0) {
    await scope.insert(
      documents,
      input.stubs.map((stub) => ({
        slug: stub.slug,
        title: stub.title,
        kind: stub.kind,
        projectId: input.projectId,
        ownerUserId: input.actorUserId,
        createdByUserId: input.actorUserId,
      })),
    );
  }

  return { taskCount, documentCount: input.stubs.length };
}

/** A readable stub title per kind. Kept here rather than i18n: the wizard and
 *  `setUpStage` both need the same plain string, and it is renamed in the UI. */
export function documentStubTitle(kind: DocumentKind): string {
  const labels: Record<DocumentKind, string> = {
    brief: "Brief",
    marketing_system: "Marketing system",
    pre_production: "Pre-production",
    case_study: "Case study",
    playbook: "Playbook",
    reference: "Reference",
    note: "Note",
  };
  return labels[kind];
}
