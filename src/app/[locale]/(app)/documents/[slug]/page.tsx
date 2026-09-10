import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ArchiveDocumentButton, EditDocumentDialog } from "@/components/documents/controls";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { getDocument } from "@/lib/data/documents";
import { cn } from "@/lib/utils";

/**
 * One document.
 *
 * The sections are the page. Read view by default; the editor is a dialog, the
 * same call the procedure screen makes -- a document is prose several people
 * touch, not a form.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("document.view");
  const document = await getDocument(session.actor, slug);
  return { title: document?.title ?? "" };
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requirePermission("document.view");

  const document = await getDocument(session.actor, slug);
  if (!document) notFound();

  const [t, kinds, ui] = await Promise.all([
    getTranslations("Documents"),
    getTranslations("DocumentKind"),
    getTranslations("Ui"),
  ]);

  const mayEdit = can(session.actor, "document.edit");
  const mayArchive = can(session.actor, "document.archive");

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <Link
        href={document.projectKey ? `/work/${document.projectKey}` : "/documents"}
        className={cn("text-label text-fg-muted rounded-control hover:underline", focusRing)}
      >
        {ui("backToList")}
      </Link>

      <header className="mt-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-display font-display text-fg-default">{document.title}</h1>
            <p className="text-caption text-fg-muted mt-1.5">
              {[
                kinds(document.kind),
                document.projectName ?? t("noProject"),
                document.ownerName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            {document.archivedAt ? <Badge tone="neutral">{t("archived")}</Badge> : null}
          </div>
        </div>

        {document.summary ? (
          <p className="text-body text-fg-default mt-4 whitespace-pre-line">{document.summary}</p>
        ) : null}

        {document.archivedAt ? (
          <p className="text-body text-fg-muted mt-3">{t("archivedNote")}</p>
        ) : null}
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-heading text-fg-default">{t("sections")}</h2>
          {mayEdit ? (
            <EditDocumentDialog
              documentId={document.id}
              initialTitle={document.title}
              initialSummary={document.summary ?? ""}
              initialKind={document.kind}
              initialSections={document.sections.map((s) => ({ title: s.title, detail: s.detail }))}
            />
          ) : null}
        </div>

        {document.sections.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noSections")}</p>
        ) : (
          <ol className="border-border divide-border bg-surface-raised divide-y rounded-card border">
            {document.sections.map((section, index) => (
              <li key={section.id} className="flex gap-3 px-4 py-3">
                <span
                  className="text-caption text-fg-muted mt-0.5 shrink-0 tabular-nums"
                  aria-hidden
                >
                  {index + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-body text-fg-default">{section.title}</p>
                  {section.detail ? (
                    <p className="text-body text-fg-muted mt-1 whitespace-pre-line">
                      {section.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {mayArchive ? (
        <div className="mt-6 flex justify-end">
          <ArchiveDocumentButton documentId={document.id} archived={document.archivedAt !== null} />
        </div>
      ) : null}
    </div>
  );
}
