import { getTranslations } from "next-intl/server";

import { NewDocumentDialog } from "@/components/documents/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { can, type Actor } from "@/lib/authz";
import { listProjectDocuments } from "@/lib/data/documents";
import { cn } from "@/lib/utils";

/**
 * The Docs tab on a project.
 *
 * The briefs and plans that belong to this project. Rendered on the server and
 * handed to `ProjectTabs` as a slot, the same arrangement `activity` and
 * `meetings` already use.
 */
export async function ProjectDocs({ actor, projectId }: { actor: Actor; projectId: string }) {
  const [t, kinds, documents] = await Promise.all([
    getTranslations("Work"),
    getTranslations("DocumentKind"),
    listProjectDocuments(actor, projectId),
  ]);

  const mayCreate = can(actor, "document.create");

  return (
    <div>
      {mayCreate ? (
        <div className="mb-4 flex justify-end">
          <NewDocumentDialog projects={[]} fixedProjectId={projectId} label={t("newDocument")} />
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("noDocs")} description={t("noDocsBody")} />
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/documents/${document.slug}`}
                className={cn(
                  "hover:bg-surface-hover block px-4 py-3.5",
                  focusRingInset,
                  transition,
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-default font-medium">{document.title}</p>
                    {document.summary ? (
                      <p className="text-caption text-fg-muted mt-0.5 line-clamp-2">
                        {document.summary}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="neutral" size="sm">
                    {kinds(document.kind)}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
