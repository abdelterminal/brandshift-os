import { getTranslations } from "next-intl/server";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { InviteDialog } from "@/components/people/invite-dialog";
import { PeopleFilters } from "@/components/people/people-filters";
import { PeoplePagination } from "@/components/people/people-pagination";
import { PeopleTable } from "@/components/people/people-table";
import { Link } from "@/i18n/navigation";
import { atLeast, can } from "@/lib/authz";
import { requireUser } from "@/lib/auth/guards";
import { listDepartments, listPeople } from "@/lib/data/people";
import { listOpenTasks, organizationToday, workloadFrom } from "@/lib/data/tasks";
import type { Role } from "@/db/schema/people";

/**
 * The directory.
 *
 * Server-paginated and filtered through the URL, so a filtered view can be
 * shared and the screen behaves the same at twelve people as at four hundred
 * -- for a coordinator. A plain member gets a simpler version of the same
 * screen: filtering, paging and workload all exist to help someone *manage*
 * a directory, and a member has no such job. They still see everyone on the
 * team, though -- this is the org chart, and "who works here" is not the
 * thing the member silo is about. What it does not show them is the
 * department structure (that is a coordinator's view of the org, not a
 * roster) or a way into anyone else's own page, where their tasks and
 * activity live.
 *
 * Workload stays for a coordinator because it is the thing they are actually
 * scanning for: not who exists, but who has room.
 */
export default async function PeoplePage({ searchParams }: PageProps<"/[locale]/people">) {
  const session = await requireUser();
  const params = await searchParams;

  // A manager and up coordinates work, which is the only reason to filter,
  // page through, or see anyone else's workload. A member is just looking
  // for a colleague.
  const isCoordinator = atLeast(session.actor, "manager");

  const query = isCoordinator && typeof params.q === "string" ? params.q : undefined;
  const role = isCoordinator && typeof params.role === "string" ? (params.role as Role) : undefined;
  const departmentId =
    isCoordinator && typeof params.department === "string" ? params.department : undefined;
  const page = isCoordinator ? Number(typeof params.page === "string" ? params.page : "1") || 1 : 1;

  const [t, roles, departments, result, openTasks] = await Promise.all([
    getTranslations("People"),
    getTranslations("Roles"),
    listDepartments(session.actor),
    // A coordinator gets the whole directory, paged and filterable. A member
    // sees everyone too, just in one page -- the pagination control is
    // coordinator-shaped, not the roster itself.
    listPeople(session.actor, {
      query,
      role,
      departmentId,
      page,
      pageSize: isCoordinator ? undefined : 100,
    }),
    // Nobody who cannot see workload should pay for computing it either.
    isCoordinator ? listOpenTasks(session.actor) : Promise.resolve([]),
  ]);

  const ui = await getTranslations("Ui");
  const workload = workloadFrom(openTasks, organizationToday());
  const filtered = Boolean(query || role || departmentId);
  const mayInvite = can(session.actor, "member.invite");

  // A member's roster is names, not links: somebody's own page is where their
  // tasks and activity live, and that is exactly what a member does not see.
  // Their own row still links, to their own page.
  const linksToPerson = (userId: string) =>
    isCoordinator || userId === session.actor.userId;

  // The department structure is a coordinator's view of the org -- how the
  // company is organized -- not part of a roster of "who works here".
  const showDepartment = isCoordinator;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("directory")}</p>
        </div>
        {mayInvite ? <InviteDialog departments={departments} /> : null}
      </header>

      {isCoordinator ? (
        <div className="mt-6">
          <PeopleFilters departments={departments} />
        </div>
      ) : null}

      {result.rows.length === 0 ? (
        <div className="border-border rounded-card mt-4 border">
          <EmptyState
            title={filtered ? t("noMatches") : t("noPeople")}
            description={filtered ? t("noMatchesBody") : t("noPeopleBody")}
          />
        </div>
      ) : (
        <>
          <ul className="border-border divide-border bg-surface-raised mt-4 divide-y rounded-card border md:hidden">
            {result.rows.map(person => {
              const load = workload.get(person.userId) ?? { open: 0, overdue: 0 };
              return <li key={person.userId} className="p-4">
                <div className="flex items-start gap-3">
                  <PersonAvatar name={person.name} src={person.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    {linksToPerson(person.userId) ? (
                      <Link href={`/people/${person.userId}`} className="text-body text-fg-default focus-visible:outline-focus-ring rounded-control font-medium hover:underline focus-visible:outline-2">{person.name}</Link>
                    ) : (
                      <span className="text-body text-fg-default font-medium">{person.name}</span>
                    )}
                    <p className="text-caption text-fg-muted mt-1 break-all">{person.email}</p>
                    <p className="text-caption text-fg-muted mt-1">{[roles(person.role), showDepartment ? person.departmentName : null, person.jobTitle].filter(Boolean).join(" · ")}</p>
                    {person.status === "invited" ? <Badge tone="attention" size="sm">{t("pending")}</Badge> : null}
                  </div>
                </div>
                {isCoordinator ? (
                  <div className="text-caption text-fg-muted mt-3 flex flex-wrap items-center gap-2">
                    {ui("openTasks", { count: load.open })}
                    {load.overdue > 0 ? <Badge tone="attention" size="sm">{ui("overdue", { count: load.overdue })}</Badge> : null}
                  </div>
                ) : null}
              </li>;
            })}
          </ul>
          <PeopleTable
            rows={result.rows.map((person) => {
              const load = workload.get(person.userId) ?? { open: 0, overdue: 0 };
              return {
                userId: person.userId,
                name: person.name,
                email: person.email,
                avatarUrl: person.avatarUrl,
                role: person.role,
                jobTitle: person.jobTitle,
                departmentName: person.departmentName,
                status: person.status,
                linkable: linksToPerson(person.userId),
                openTasks: load.open,
                overdueTasks: load.overdue,
              };
            })}
            showDepartment={showDepartment}
            isCoordinator={isCoordinator}
          />

          {isCoordinator ? (
            <PeoplePagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              shown={result.rows.length}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
