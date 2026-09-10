import { getTranslations } from "next-intl/server";

import { PlaybookEditor } from "@/components/playbook/controls";
import { requirePermission } from "@/lib/auth/guards";
import { getPlaybook } from "@/lib/data/playbook";
import { listTemplates } from "@/lib/data/templates";

/**
 * The playbook.
 *
 * One row per delivery stage. Each says what reaching that stage should create
 * -- a task template and a set of document stubs -- and shows the procedure
 * that is already linked to it (`sops.stage`). A project on the flow picks all
 * of this up when it arrives at the stage.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Playbook");
  return { title: t("title") };
}

export default async function PlaybookPage() {
  const session = await requirePermission("playbook.manage");

  const [t, rows, templates] = await Promise.all([
    getTranslations("Playbook"),
    getPlaybook(session.actor),
    listTemplates(session.actor),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
        <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        <p className="text-caption text-fg-subtle mt-2">{t("manageHint")}</p>
      </header>

      <PlaybookEditor
        rows={rows.map((row) => ({
          stage: row.stage,
          sop: row.sop,
          templateId: row.templateId,
          docKinds: row.docKinds,
        }))}
        templates={templates.map((template) => ({ id: template.id, name: template.name }))}
      />
    </div>
  );
}
