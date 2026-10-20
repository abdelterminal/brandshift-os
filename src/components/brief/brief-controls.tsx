"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { SectionFields, type DraftSection } from "@/components/documents/controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { removeAttachment, startBrief, uploadAttachment } from "@/lib/actions/attachments";
import { createDocumentAction, updateDocumentAction } from "@/lib/actions/documents";
import { briefTemplate } from "@/lib/brief-template";
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "@/lib/storage/limits";

/**
 * Writing a brief, and hanging files off it.
 *
 * The editor is `SectionFields` -- the same ordered sections a document or a
 * procedure uses, for the reason `DECISIONS.md` gives: it renders with no
 * Markdown parser and is not an injection surface for text several people
 * edit.
 *
 * Everything here is gated on `brief.edit` by whoever renders it, and every
 * action re-checks server-side, so a control that should not be on screen and
 * an action that would refuse cannot disagree.
 */

function useBriefErrors() {
  const t = useTranslations("Brief");
  return (code: string) => {
    const known: Record<string, string> = {
      notFound: t("errorNotFound"),
      fileTooLarge: t("errorFileTooLarge"),
      fileTypeNotAllowed: t("errorFileType"),
      tooManyFiles: t("errorTooManyFiles"),
      fileEmpty: t("errorFileEmpty"),
    };
    return known[code] ?? t("errorInvalid");
  };
}

/** What the picker offers. Convenience only -- the server decides. */
const ACCEPT = Object.keys(ALLOWED_TYPES).join(",");

type BriefTarget = { projectId?: string; companyId?: string };

/**
 * Write the first brief, optionally starting from the template.
 *
 * The template is the answer to "I have never written one of these". It fills
 * the editor with the questions a brief should answer, each as a section whose
 * detail is the prompt; the author replaces the prompts with the answers.
 */
export function WriteBriefDialog({
  target,
  defaultTitle,
  fromTemplate,
  label,
}: {
  target: BriefTarget;
  defaultTitle: string;
  /** Open with the template already filled in, rather than one blank section. */
  fromTemplate: boolean;
  label: string;
}) {
  const t = useTranslations("Brief");
  const errorText = useBriefErrors();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [summary, setSummary] = useState("");
  const [sections, setSections] = useState<DraftSection[]>([{ title: "", detail: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Built here rather than passed in: these are UI strings and this is where
  // the translator lives. `briefTemplate` owns the order and the keys.
  const template = briefTemplate((key) => t(key));

  function onOpenChange(next: boolean) {
    if (next) {
      setTitle(defaultTitle);
      setSummary("");
      setSections(fromTemplate ? template : [{ title: "", detail: "" }]);
      setError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button variant={fromTemplate ? "secondary" : "primary"} onClick={() => onOpenChange(true)}>
        {label}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("writeTitle")}</DialogTitle>
            <DialogDescription>
              {fromTemplate ? t("writeFromTemplateBody") : t("writeBody")}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await createDocumentAction({
                  title: title.trim(),
                  summary: summary.trim() || undefined,
                  kind: "brief",
                  projectId: target.projectId ?? "",
                  companyId: target.companyId ?? "",
                  // Blank sections are dropped rather than refused: somebody
                  // starting from the template will not answer every question
                  // on the first pass, and refusing the save would teach them
                  // to type a full stop into each one.
                  sections: sections
                    .filter((section) => section.title.trim().length > 0)
                    .map((section) => ({ title: section.title, detail: section.detail })),
                });
                if (!result.ok) {
                  setError(errorText(result.error));
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field>
              <FieldLabel>{t("fieldTitle")}</FieldLabel>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            </Field>

            <Field>
              <FieldLabel>{t("fieldSummary")}</FieldLabel>
              <Textarea
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={2000}
                placeholder={t("fieldSummaryPlaceholder")}
              />
            </Field>

            <SectionFields sections={sections} setSections={setSections} />

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("cancel")}</Button>} />
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={title.trim().length === 0}
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Change what a brief says. Same editor, seeded from what is there. */
export function EditBriefDialog({
  documentId,
  initial,
}: {
  documentId: string;
  initial: { title: string; summary: string; sections: DraftSection[] };
}) {
  const t = useTranslations("Brief");
  const errorText = useBriefErrors();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [sections, setSections] = useState<DraftSection[]>(initial.sections);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Reopening after a cancel shows what is stored, not what was typed. */
  function onOpenChange(next: boolean) {
    if (next) {
      setTitle(initial.title);
      setSummary(initial.summary);
      setSections(initial.sections.length > 0 ? initial.sections : [{ title: "", detail: "" }]);
      setError(null);
    }
    setOpen(next);
  }

  return (
    <>
      <Button onClick={() => onOpenChange(true)}>{t("edit")}</Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await updateDocumentAction({
                  documentId,
                  title: title.trim(),
                  summary: summary.trim() || undefined,
                  kind: "brief",
                  sections: sections
                    .filter((section) => section.title.trim().length > 0)
                    .map((section) => ({ title: section.title, detail: section.detail })),
                });
                if (!result.ok) {
                  setError(errorText(result.error));
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field>
              <FieldLabel>{t("fieldTitle")}</FieldLabel>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            </Field>

            <Field>
              <FieldLabel>{t("fieldSummary")}</FieldLabel>
              <Textarea
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={2000}
              />
            </Field>

            <SectionFields sections={sections} setSections={setSections} />

            {error ? (
              <p role="alert" className="text-body text-blocked-text">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose render={<Button type="button">{t("cancel")}</Button>} />
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={title.trim().length === 0}
              >
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Attaching a file.
 *
 * A plain file input behind a button rather than a drop zone: a drop zone that
 * is the only way in is unusable from a keyboard, and this is the whole of
 * what "add a file" needs. The size check runs here too, so somebody choosing
 * a 40 MB video is told before it is uploaded rather than after -- the server
 * refuses it either way, and this only saves them the wait.
 */
export function AttachmentUploader({
  documentId,
  createFor,
}: {
  /** The brief to attach to, when there already is one. */
  documentId?: string;
  /**
   * Where to make one first, when there is not.
   *
   * The brief is not always a written document -- for plenty of jobs it *is*
   * the PDF the client sent -- so attaching a file has to be able to come
   * first. Given this, the uploader makes an empty brief and hangs the file
   * off it, rather than asking somebody to write a document they do not want
   * before letting them attach the one they do.
   */
  createFor?: { projectId?: string; companyId?: string; title: string };
}) {
  const t = useTranslations("Brief");
  const errorText = useBriefErrors();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset immediately so choosing the same file twice still fires.
          event.target.value = "";
          if (!file) return;

          if (file.size > MAX_FILE_BYTES) {
            setError(errorText("fileTooLarge"));
            return;
          }

          setError(null);

          startTransition(async () => {
            // Make the brief first if there is not one. Done here rather than
            // inside `uploadAttachment` so that action keeps one job and one
            // permission question.
            let target = documentId;
            if (!target && createFor) {
              const started = await startBrief(createFor);
              if (!started.ok) {
                setError(errorText(started.error));
                return;
              }
              target = started.id;
            }
            if (!target) {
              setError(errorText("invalid"));
              return;
            }

            const body = new FormData();
            body.set("documentId", target);
            body.set("file", file);

            const result = await uploadAttachment(body);
            if (!result.ok) {
              setError(errorText(result.error));
              return;
            }
            router.refresh();
          });
        }}
      />

      <Button
        size="sm"
        loading={pending}
        onClick={() => inputRef.current?.click()}
        className="w-fit"
      >
        <Paperclip aria-hidden className="size-4" />
        {t("addFile")}
      </Button>

      <p className="text-caption text-fg-muted">{t("fileHint")}</p>

      <div aria-live="polite" className="empty:hidden">
        {error ? <p className="text-caption text-blocked-text">{error}</p> : null}
      </div>
    </div>
  );
}

/** Taking one off again. Confirms in place, never a dialog from a dialog. */
export function RemoveAttachmentButton({
  attachmentId,
  fileName,
}: {
  attachmentId: string;
  fileName: string;
}) {
  const t = useTranslations("Brief");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("removeFileLabel", { name: fileName })}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden className="size-4" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="destructive"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            await removeAttachment(attachmentId);
            setConfirming(false);
            router.refresh();
          })
        }
      >
        {t("removeFileConfirm")}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
    </span>
  );
}
