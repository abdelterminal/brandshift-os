"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserForAction } from "@/lib/auth/guards";
import { can } from "@/lib/authz";
import { recordActivity } from "@/lib/data/activity";
import { PROJECT_STAGES, setProjectStage } from "@/lib/data/pipeline";
import { getProjectById } from "@/lib/data/projects";

/**
 * Moving a project along the delivery flow.
 *
 * One write, and it records the transition. The stage change reaches the
 * project's channel with no extra wiring -- the feed interleaves
 * `activity_events`, so a `project.stageChanged` row shows up there the next
 * time the channel is opened, the same way a task move does.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  projectId: z.uuid(),
  // `null` moves the project off the flow (an internal project).
  stage: z.union([z.enum(PROJECT_STAGES), z.null()]),
});

export async function setProjectStageAction(
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const session = await requireUserForAction();

  const project = await getProjectById(session.actor, parsed.data.projectId);
  if (!project) return { ok: false, error: "notFound" };

  if (!can(session.actor, "project.setStage", { ownerUserId: project.ownerUserId ?? undefined })) {
    return { ok: false, error: "forbidden" };
  }

  const moved = await setProjectStage(session.actor, parsed.data.projectId, parsed.data.stage);
  if (!moved) return { ok: false, error: "alreadyThere" };

  await recordActivity(session.actor, {
    verb: "project.stageChanged",
    subjectType: "project",
    subjectId: project.id,
    projectId: project.id,
    // `title` is the key the activity feed reads; `to`/`from` are raw stage
    // values, matching how `deal.stageChanged` records its move.
    metadata: { title: project.name, from: moved.from ?? "", to: moved.to ?? "" },
  });

  revalidatePath(`/${await getLocale()}`, "layout");
  return { ok: true };
}
