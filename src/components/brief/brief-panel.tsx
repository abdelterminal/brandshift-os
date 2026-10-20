import { FileText, Image as ImageIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  AttachmentUploader,
  EditBriefDialog,
  RemoveAttachmentButton,
  WriteBriefDialog,
} from "@/components/brief/brief-controls";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { focusRing, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { withBasePath } from "@/lib/base-path";
import { can, type Actor } from "@/lib/authz";
import { getCompanyBrief, getProjectBrief, listAttachments } from "@/lib/data/documents";
import { cn } from "@/lib/utils";

/**
 * The brief, wherever it is shown.
 *
 * One component for the project tab and the client page, because a brief
 * reads the same in both places and two renderings would drift. Which one it
 * is showing comes from `target`.
 *
 * Reading is open to the whole organization (`document.view`), which is the
 * point of it -- the people doing the work are the ones who need to know what
 * was agreed. Writing is `brief.edit`: manager, admin and owner, with no
 * module-flag way in, because changing a brief is changing what was promised
 * to a client.
 */

type Target =
  | { kind: "project"; projectId: string; name: string }
  | { kind: "company"; companyId: string; name: string };

function prettyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function BriefPanel({
  actor,
  target,
  /** Shown under a project's brief, so its client's standing brief is one click away. */
  clientBrief,
}: {
  actor: Actor;
  target: Target;
  clientBrief?: { companyName: string; companySlug: string; exists: boolean } | null;
}) {
  const [t, format] = await Promise.all([getTranslations("Brief"), getFormatter()]);

  const brief =
    target.kind === "project"
      ? await getProjectBrief(actor, target.projectId)
      : await getCompanyBrief(actor, target.companyId);

  const mayEdit = can(actor, "brief.edit");
  const attachments = brief ? await listAttachments(actor, brief.id) : [];

  const briefTarget =
    target.kind === "project" ? { projectId: target.projectId } : { companyId: target.companyId };

  const clientLink =
    clientBrief && clientBrief.exists ? (
      <p className="text-caption text-fg-muted">
        {t.rich("alsoClientBrief", {
          name: clientBrief.companyName,
          link: (chunks) => (
            <Link
              href={`/crm/companies/${clientBrief.companySlug}`}
              className={cn("text-accent-text rounded-[4px] hover:underline", focusRing, transition)}
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    ) : null;

  if (!brief) {
    return (
      <div className="flex flex-col gap-3">
        <div className="border-border rounded-card border">
          <EmptyState
            title={t("emptyTitle")}
            description={mayEdit ? t("emptyBodyEditor") : t("emptyBody")}
          />
          {mayEdit ? (
            <div className="flex flex-wrap justify-center gap-2 px-4 pb-6">
              {/*
                The template first, and the plain one beside it. Somebody who
                has never written a brief is the reason this feature was asked
                for, and a blank editor is exactly what stopped them before.
              */}
              <WriteBriefDialog
                target={briefTarget}
                defaultTitle={t("defaultTitle", { name: target.name })}
                fromTemplate
                label={t("startFromTemplate")}
              />
              <WriteBriefDialog
                target={briefTarget}
                defaultTitle={t("defaultTitle", { name: target.name })}
                fromTemplate={false}
                label={t("writeBlank")}
              />
            </div>
          ) : null}
        </div>
        {clientLink}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-surface-raised rounded-card border">
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-heading font-display text-fg-default">{brief.title}</h2>
            {brief.summary ? (
              <p className="text-body text-fg-muted mt-1">{brief.summary}</p>
            ) : null}
            <p className="text-caption text-fg-subtle mt-1">
              {t("lastChanged", { when: format.relativeTime(brief.updatedAt) })}
            </p>
          </div>
          {mayEdit ? (
            <EditBriefDialog
              documentId={brief.id}
              initial={{
                title: brief.title,
                summary: brief.summary ?? "",
                sections: brief.sections.map((section) => ({
                  title: section.title,
                  detail: section.detail ?? "",
                })),
              }}
            />
          ) : null}
        </div>

        {brief.sections.length === 0 ? (
          /*
            A brief that exists but says nothing.

            Not hypothetical: onboarding's playbook can list `brief` in its
            expected documents, which creates a titled stub with no sections
            the moment a project joins the delivery flow. Without this, that
            stub replaces the empty state and its "start from the template"
            button, and the one person who needed the template is the one who
            never sees it.
          */
          <div className="px-4 py-4">
            <p className="text-body text-fg-muted">{t("noSections")}</p>
            {mayEdit ? (
              <p className="text-caption text-fg-subtle mt-1">{t("noSectionsHint")}</p>
            ) : null}
          </div>
        ) : (
          <ol className="divide-border divide-y">
            {brief.sections.map((section, index) => (
              <li key={section.id} className="px-4 py-3.5">
                <h3 className="text-label text-fg-default">
                  <span className="text-fg-subtle tabular-nums">{index + 1}.</span> {section.title}
                </h3>
                {section.detail ? (
                  // `whitespace-pre-line`, never a Markdown parser -- the same
                  // rule a document and a procedure render under.
                  <p className="text-body text-fg-muted mt-1 whitespace-pre-line">
                    {section.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-border bg-surface-raised rounded-card border">
        <div className="border-border border-b px-4 py-3">
          <h3 className="text-label text-fg-default">{t("files")}</h3>
        </div>

        {attachments.length === 0 ? (
          <p className="text-body text-fg-muted px-4 py-3">{t("noFiles")}</p>
        ) : (
          <ul className="divide-border divide-y">
            {attachments.map((file) => {
              const Icon = file.mimeType === "application/pdf" ? FileText : ImageIcon;
              return (
                <li key={file.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon aria-hidden className="text-fg-subtle size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-default truncate">{file.fileName}</p>
                    <p className="text-caption text-fg-subtle tabular-nums">
                      {prettyBytes(file.sizeBytes)}
                    </p>
                  </div>
                  {/*
                    A plain anchor, not `Link`: this leaves the app for a file
                    stream rather than navigating a route, and the base path
                    has to be applied by hand because `/api` is not
                    locale-scoped and never goes through `i18n/navigation`.
                  */}
                  <Button
                    size="sm"
                    render={
                      <a href={withBasePath(`/api/attachments/${file.id}`)} download={file.fileName} />
                    }
                  >
                    {t("download")}
                  </Button>
                  {mayEdit ? (
                    <RemoveAttachmentButton attachmentId={file.id} fileName={file.fileName} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {mayEdit ? (
          <div className="border-border border-t px-4 py-3">
            <AttachmentUploader documentId={brief.id} />
          </div>
        ) : null}
      </div>

      {clientLink}
    </div>
  );
}
