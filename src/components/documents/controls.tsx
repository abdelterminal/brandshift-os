"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import {
  archiveDocumentAction,
  createDocumentAction,
  updateDocumentAction,
} from "@/lib/actions/documents";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/data/document-kinds";
import { cn } from "@/lib/utils";

/**
 * Writing a document.
 *
 * The section editor is the SOP step editor with the review ritual removed --
 * same shape, same wholesale replace, same reason (plain text, no parser). A
 * document also carries a `kind` and, optionally, the project it belongs to;
 * both are set at creation and editable afterwards.
 */

export type Option = { id: string; label: string };

const selectClass = cn(
  "h-9 w-full rounded-control border px-2.5 text-body",
  "bg-surface-raised text-fg-default border-border-control hover:border-border-hover",
  focusRing,
  transition,
);

function useErrorText() {
  const t = useTranslations("Documents");
  return (code: string) => {
    const known: Record<string, string> = {
      notFound: t("errorNotFound"),
      forbidden: t("errorForbidden"),
      alreadyThere: t("errorAlreadyThere"),
      noSections: t("errorNoSections"),
    };
    return known[code] ?? t("errorInvalid");
  };
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-body text-status-blocked-text">
      {children}
    </p>
  );
}

type DraftSection = { title: string; detail: string };
const emptySection = (): DraftSection => ({ title: "", detail: "" });

function SectionFields({
  sections,
  setSections,
}: {
  sections: DraftSection[];
  setSections: React.Dispatch<React.SetStateAction<DraftSection[]>>;
}) {
  const t = useTranslations("Documents");
  const ui = useTranslations("Ui");
  const [justMoved, setJustMoved] = useState<[number, number] | null>(null);

  const move = (index: number, offset: number) => {
    setSections((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
      return next;
    });
    setJustMoved([index, index + offset]);
    setTimeout(() => setJustMoved(null), 400);
  };
  const update = (index: number, patch: Partial<DraftSection>) =>
    setSections((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <fieldset className="border-border space-y-3 rounded-card border p-4">
      <legend className="text-label text-fg-default px-1 font-semibold">{t("sections")}</legend>

      {sections.map((section, index) => (
        <div
          key={index}
          className={cn(
            "space-y-2 rounded-control p-1.5 -m-1.5",
            "transition-colors duration-[var(--duration-slow)] ease-[var(--ease-out)]",
            justMoved?.includes(index) ? "bg-surface-active" : "bg-transparent",
          )}
        >
          <Input
            aria-label={`${t("sectionTitle")} ${index + 1}`}
            value={section.title}
            onChange={(event) => update(index, { title: event.target.value })}
            placeholder={t("sectionTitlePlaceholder")}
            maxLength={300}
          />
          <Textarea
            aria-label={`${t("sectionDetail")} ${index + 1}`}
            value={section.detail}
            onChange={(event) => update(index, { detail: event.target.value })}
            placeholder={t("sectionDetail")}
            maxLength={4000}
            rows={4}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`${ui("moveUp")} ${index + 1}`}
            >
              {ui("moveUp")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={index === sections.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`${ui("moveDown")} ${index + 1}`}
            >
              {ui("moveDown")}
            </Button>
            {sections.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSections((current) => current.filter((_, i) => i !== index))}
              >
                {t("removeSection", { number: index + 1 })}
              </Button>
            ) : null}
          </div>
        </div>
      ))}

      {sections.length < 50 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSections((current) => [...current, emptySection()])}
        >
          {t("addSection")}
        </Button>
      ) : null}
    </fieldset>
  );
}

function KindField({ defaultValue }: { defaultValue?: DocumentKind }) {
  const t = useTranslations("Documents");
  const kinds = useTranslations("DocumentKind");
  return (
    <Field>
      <FieldLabel htmlFor="kind">{t("kind")}</FieldLabel>
      <select id="kind" name="kind" className={selectClass} defaultValue={defaultValue ?? "note"}>
        {DOCUMENT_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {kinds(kind)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NewDocumentDialog({
  projects,
  fixedProjectId,
  label,
}: {
  projects: Option[];
  /** When launched from a project's Docs tab: lock the project, hide the picker. */
  fixedProjectId?: string;
  label?: string;
}) {
  const t = useTranslations("Documents");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sections, setSections] = useState<DraftSection[]>([emptySection()]);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createDocumentAction({
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        kind: String(formData.get("kind") ?? "note") as DocumentKind,
        projectId: fixedProjectId ?? String(formData.get("projectId") ?? ""),
        sections: sections.map((s) => ({ title: s.title, detail: s.detail })),
      });
      if (result && !result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label ?? t("newDocument")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("newDocument")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <Field>
              <FieldLabel htmlFor="title">{t("documentTitle")}</FieldLabel>
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                placeholder={t("documentTitlePlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="summary">{t("summary")}</FieldLabel>
              <Input
                id="summary"
                name="summary"
                maxLength={2000}
                placeholder={t("summaryPlaceholder")}
              />
            </Field>

            <div className={cn("grid gap-4", !fixedProjectId && "sm:grid-cols-2")}>
              <KindField />
              {!fixedProjectId ? (
                <Field>
                  <FieldLabel htmlFor="projectId">{t("project")}</FieldLabel>
                  <select id="projectId" name="projectId" className={selectClass}>
                    <option value="">{t("noProject")}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>

            <SectionFields sections={sections} setSections={setSections} />

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditDocumentDialog({
  documentId,
  initialTitle,
  initialSummary,
  initialKind,
  initialSections,
}: {
  documentId: string;
  initialTitle: string;
  initialSummary: string;
  initialKind: DocumentKind;
  initialSections: Array<{ title: string; detail: string | null }>;
}) {
  const t = useTranslations("Documents");
  const errorText = useErrorText();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sections, setSections] = useState<DraftSection[]>(
    initialSections.length > 0
      ? initialSections.map((s) => ({ title: s.title, detail: s.detail ?? "" }))
      : [emptySection()],
  );

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateDocumentAction({
        documentId,
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        kind: String(formData.get("kind") ?? initialKind) as DocumentKind,
        sections: sections.map((s) => ({ title: s.title, detail: s.detail })),
      });
      if (!result.ok) setError(errorText(result.error));
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("editSections")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("editSections")}</DialogTitle>
          </DialogHeader>

          <form action={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto">
            <Field>
              <FieldLabel htmlFor="title">{t("documentTitle")}</FieldLabel>
              <Input id="title" name="title" required maxLength={200} defaultValue={initialTitle} />
            </Field>
            <Field>
              <FieldLabel htmlFor="summary">{t("summary")}</FieldLabel>
              <Input id="summary" name="summary" maxLength={2000} defaultValue={initialSummary} />
            </Field>
            <KindField defaultValue={initialKind} />

            <SectionFields sections={sections} setSections={setSections} />

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button type="submit" loading={pending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ArchiveDocumentButton({
  documentId,
  archived,
}: {
  documentId: string;
  archived: boolean;
}) {
  const t = useTranslations("Documents");
  const errorText = useErrorText();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await archiveDocumentAction({ documentId, archived: !archived });
            if (!result.ok) setError(errorText(result.error));
            else router.refresh();
          })
        }
      >
        {archived ? t("restore") : t("archive")}
      </Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
