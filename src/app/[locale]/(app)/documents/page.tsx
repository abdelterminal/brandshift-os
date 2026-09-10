import { getTranslations } from "next-intl/server";

import { NewDocumentDialog } from "@/components/documents/controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRingInset, transition } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/auth/guards";
import { listDocuments, type DocumentView } from "@/lib/data/documents";
import { listProjects } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

/**
 * Organization-level documents.
 *
 * The briefs and plans that belong to a project live on that project's Docs
 * tab; this screen is the rest -- playbooks, references, the pages that are
 * about how the studio runs rather than about one client. Grouped by kind
 * because that is how somebody looks for one.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Documents");
  return { title: t("title") };
}

export default async function DocumentsPage() {
  const session = await requirePermission("document.view");

  const [t, kinds, documents, projects] = await Promise.all([
    getTranslations("Documents"),
    getTranslations("DocumentKind"),
    listDocuments(session.actor),
    listProjects(session.actor),
  ]);

  const mayCreate = can(session.actor, "document.create");

  const byKind = new Map<DocumentView["kind"], DocumentView[]>();
  for (const document of documents) {
    const list = byKind.get(document.kind) ?? [];
    list.push(document);
    byKind.set(document.kind, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("subtitle")}</p>
        </div>
        {mayCreate ? (
          <NewDocumentDialog
            projects={projects.map((project) => ({ id: project.id, label: project.name }))}
          />
        ) : null}
      </header>

      {documents.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : (
        [...byKind.entries()].map(([kind, list]) => (
          <section key={kind} className="mb-8">
            <h2 className="text-heading text-fg-default mb-3">{kinds(kind)}</h2>
            <ul className="border-border divide-border bg-surface-raised divide-y rounded-card border">
              {list.map((document) => (
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
                      {document.projectName ? (
                        <Badge tone="neutral" size="sm">
                          {document.projectName}
                        </Badge>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
