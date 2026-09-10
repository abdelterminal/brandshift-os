import { getTranslations } from "next-intl/server";

import { PipelineBoard } from "@/components/work/pipeline-board";
import { WorkViewToggle } from "@/components/work/view-toggle";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { listPipeline } from "@/lib/data/pipeline";

/**
 * The pipeline board -- a second view of Work, by delivery stage.
 *
 * `/work` stays a list, the same call CRM makes; this is where "which client
 * is where" gets answered in one scan. Whether a card can be dragged is worked
 * out here, per project, so the client never has to know the rule.
 */

export async function generateMetadata() {
  const t = await getTranslations("Pipeline");
  return { title: t("title") };
}

export default async function PipelinePage() {
  const session = await requirePermission("work.view");

  const [t, columns] = await Promise.all([
    getTranslations("Pipeline"),
    listPipeline(session.actor),
  ]);

  const canMove: Record<string, boolean> = {};
  for (const column of columns) {
    for (const card of column.cards) {
      canMove[card.id] = can(session.actor, "project.setStage", {
        ownerUserId: card.ownerUserId ?? undefined,
      });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
      </header>

      <div className="mb-5">
        <WorkViewToggle current="pipeline" />
      </div>

      <PipelineBoard columns={columns} canMove={canMove} />
    </div>
  );
}
