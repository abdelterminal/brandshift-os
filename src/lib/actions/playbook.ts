"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermissionForAction, requireUserForAction } from "@/lib/auth/guards";
import { dayKey } from "@/lib/calendar-dates";
import { recordActivity } from "@/lib/data/activity";
import { DOCUMENT_KINDS } from "@/lib/data/document-kinds";
import { PROJECT_STAGES } from "@/lib/data/pipeline-stages";
import { setStagePlaybook, setUpStage } from "@/lib/data/playbook";
import { mayWorkOn } from "@/lib/data/project-access";
import { getProjectById } from "@/lib/data/projects";

/**
 * Configuring the delivery flow, and running a stage's setup against a project.
 *
 * Two different privileges: writing the playbook is a manager's call
 * (`playbook.manage`), the same as writing a template. Running a stage's
 * setup -- creating the tasks and document stubs it names -- is work, not a
 * client-facing decision, so it is `mayWorkOn()`: the project's own assignee,
 * lead or contributor, or a manager. Moving the project *to* a different
 * stage is the separate, narrower `project.setStage` -- that one stays a
 * manager's or the project owner's call, because it is what the client sees.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

async function revalidateApp() {
  revalidatePath(`/${await getLocale()}`, "layout");
}

const configSchema = z.object({
  stage: z.enum(PROJECT_STAGES),
  templateId: z.union([z.uuid(), z.literal("")]),
  docKinds: z.array(z.enum(DOCUMENT_KINDS)).max(DOCUMENT_KINDS.length),
});

export async function setStagePlaybookAction(
  input: z.input<typeof configSchema>,
): Promise<ActionResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requirePermissionForAction("playbook.manage");

  await setStagePlaybook(session.actor, parsed.data.stage, {
    templateId: parsed.data.templateId || null,
    // De-dupe: the form can submit the same kind twice if the UI ever repeats it.
    docKinds: [...new Set(parsed.data.docKinds)],
  });

  revalidatePath(`/${await getLocale()}/playbook`);
  return { ok: true };
}

const setUpSchema = z.object({ projectId: z.uuid(), stage: z.enum(PROJECT_STAGES) });

export async function setUpStageAction(input: z.input<typeof setUpSchema>): Promise<ActionResult> {
  const parsed = setUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requireUserForAction();
  const project = await getProjectById(session.actor, parsed.data.projectId);
  if (!project) return { ok: false, error: "notFound" };

  if (!(await mayWorkOn(session.actor, { projectId: project.id, assigneeUserId: null }))) {
    return { ok: false, error: "forbidden" };
  }

  const anchorIso = dayKey(new Date(), session.organization.timezone);
  const result = await setUpStage(session.actor, parsed.data.projectId, parsed.data.stage, anchorIso);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordActivity(session.actor, {
    verb: "project.stageSetUp",
    subjectType: "project",
    subjectId: project.id,
    projectId: project.id,
    // `title` and `to` are the keys the activity feed reads; `to` is the raw
    // stage value, matching `project.stageChanged`.
    metadata: {
      title: project.name,
      to: parsed.data.stage,
      taskCount: result.taskCount,
      documentCount: result.documentCount,
    },
  });

  await revalidateApp();
  return { ok: true };
}
