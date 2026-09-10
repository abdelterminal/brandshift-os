"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { focusRing, transition } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import { setStagePlaybookAction } from "@/lib/actions/playbook";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/data/document-kinds";
import type { ProjectStage } from "@/lib/data/pipeline-stages";
import { cn } from "@/lib/utils";

export type PlaybookRowData = {
  stage: ProjectStage;
  sop: { slug: string; title: string } | null;
  templateId: string | null;
  docKinds: DocumentKind[];
};

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

/**
 * The playbook, one editable row per stage.
 *
 * Per-row save rather than one big form: the eight stages are independent
 * settings, and a single Save that writes all of them makes an unrelated
 * change to stage two feel risky when you only touched stage six -- the same
 * call the Settings screens make.
 */
export function PlaybookEditor({
  rows,
  templates,
}: {
  rows: PlaybookRowData[];
  templates: { id: string; name: string }[];
}) {
  const t = useTranslations("Playbook");
  const stageLabels = useTranslations("ProjectStage");

  return (
    <div className="border-border divide-border bg-surface-raised divide-y rounded-card border">
      {rows.map((row) => (
        <StageRow
          key={row.stage}
          row={row}
          templates={templates}
          label={stageLabels(row.stage)}
          procedureLabel={t("stageProcedure")}
          noProcedure={t("noProcedure")}
        />
      ))}
    </div>
  );
}

function StageRow({
  row,
  templates,
  label,
  procedureLabel,
  noProcedure,
}: {
  row: PlaybookRowData;
  templates: { id: string; name: string }[];
  label: string;
  procedureLabel: string;
  noProcedure: string;
}) {
  const t = useTranslations("Playbook");
  const kindLabels = useTranslations("DocumentKind");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [templateId, setTemplateId] = useState(row.templateId ?? "");
  const [docKinds, setDocKinds] = useState<Set<DocumentKind>>(new Set(row.docKinds));

  const dirty =
    templateId !== (row.templateId ?? "") ||
    docKinds.size !== row.docKinds.length ||
    row.docKinds.some((kind) => !docKinds.has(kind));

  function toggle(kind: DocumentKind) {
    setDocKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await setStagePlaybookAction({
        stage: row.stage,
        templateId,
        docKinds: [...docKinds],
      });
      if (!result.ok) {
        toast.add({ title: t("save"), data: { tone: "attention" } });
        return;
      }
      toast.add({ title: t("saved") });
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading text-fg-default">{label}</h2>
        <p className="text-caption text-fg-muted">
          {procedureLabel}:{" "}
          {row.sop ? (
            <Link
              href={`/sops/${row.sop.slug}`}
              className={cn("text-fg-default hover:underline", focusRing)}
            >
              {row.sop.title}
            </Link>
          ) : (
            <span className="text-fg-subtle">{noProcedure}</span>
          )}
        </p>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <label className="block">
          <span className="text-label text-fg-muted mb-1 block">{t("taskTemplate")}</span>
          <select
            className={selectClass}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            disabled={pending}
          >
            <option value="">{t("noTemplate")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-label text-fg-muted mb-1">{t("expectedDocuments")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {DOCUMENT_KINDS.map((kind) => (
              <label key={kind} className="text-body text-fg-default flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={docKinds.has(kind)}
                  onChange={() => toggle(kind)}
                  disabled={pending}
                  className="size-4 rounded-[4px]"
                />
                {kindLabels(kind)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="secondary" onClick={save} loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
