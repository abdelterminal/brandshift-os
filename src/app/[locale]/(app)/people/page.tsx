import { getTranslations } from "next-intl/server";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, CountBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteDialog } from "@/components/people/invite-dialog";
import { PeopleFilters } from "@/components/people/people-filters";
import { PeoplePagination } from "@/components/people/people-pagination";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/authz";
import { requireUser } from "@/lib/auth/guards";
import { listDepartments, listPeople } from "@/lib/data/people";
import { listOpenTasks, organizationToday, workloadFrom } from "@/lib/data/tasks";
import type { Role } from "@/db/schema/people";

/**
 * The directory.
 *
 * Server-paginated and filtered through the URL, so a filtered view can be
 * shared and the screen behaves the same at twelve people as at four hundred.
 *
 * Workload is shown here because it is the thing a coordinator scanning this
 * list actually wants: not who exists, but who has room.
 */
export default async function PeoplePage({ searchParams }: PageProps<"/[locale]/people">) {
  const session = await requireUser();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : undefined;
  const role = typeof params.role === "string" ? (params.role as Role) : undefined;
  const departmentId = typeof params.department === "string" ? params.department : undefined;
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const [t, roles, departments, result, openTasks] = await Promise.all([
    getTranslations("People"),
    getTranslations("Roles"),
    listDepartments(session.actor),
    listPeople(session.actor, { query, role, departmentId, page }),
    listOpenTasks(session.actor),
  ]);

  const ui = await getTranslations("Ui");
  const workload = workloadFrom(openTasks, organizationToday());
  const filtered = Boolean(query || role || departmentId);
  const mayInvite = can(session.actor, "member.invite");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display font-display text-fg-default">{t("title")}</h1>
          <p className="text-body text-fg-muted mt-1.5">{t("directory")}</p>
        </div>
        {mayInvite ? <InviteDialog departments={departments} /> : null}
      </header>

      <div className="mt-6">
        <PeopleFilters departments={departments} />
      </div>

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
                    <Link href={`/people/${person.userId}`} className="text-body text-fg-default focus-visible:outline-focus-ring rounded-control font-medium hover:underline focus-visible:outline-2">{person.name}</Link>
                    <p className="text-caption text-fg-muted mt-1 break-all">{person.email}</p>
                    <p className="text-caption text-fg-muted mt-1">{[roles(person.role), person.departmentName, person.jobTitle].filter(Boolean).join(" · ")}</p>
                    {person.status === "invited" ? <Badge tone="attention" size="sm">{t("pending")}</Badge> : null}
                  </div>
                </div>
                <div className="text-caption text-fg-muted mt-3 flex flex-wrap items-center gap-2">
                  {ui("openTasks", { count: load.open })}
                  {load.overdue > 0 ? <Badge tone="attention" size="sm">{ui("overdue", { count: load.overdue })}</Badge> : null}
                </div>
              </li>;
            })}
          </ul>
          <TableContainer className="mt-4 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("role")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("department")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("jobTitle")}</TableHead>
                  <TableHead>{t("workload")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((person) => {
                  const load = workload.get(person.userId) ?? { open: 0, overdue: 0 };

                  return (
                    <TableRow key={person.userId}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <PersonAvatar
                            name={person.name}
                            src={person.avatarUrl}
                            size="sm"
                            className="shrink-0"
                          />
                          <span className="min-w-0">
                            <Link
                              href={`/people/${person.userId}`}
                              className="text-fg-default focus-visible:outline-focus-ring block truncate rounded-[4px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {person.name}
                            </Link>
                            <span className="text-caption text-fg-subtle block truncate">
                              {person.email}
                            </span>
                          </span>
                          {person.status === "invited" ? (
                            <Badge tone="attention" size="sm" className="shrink-0">
                              {t("pending")}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>

                      <TableCell className="hidden sm:table-cell">
                        <Badge tone={person.role === "owner" ? "accent" : "neutral"} size="sm">
                          {roles(person.role)}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-fg-muted hidden md:table-cell">
                        {person.departmentName ?? "--"}
                      </TableCell>

                      <TableCell className="text-fg-muted hidden lg:table-cell">
                        {person.jobTitle ?? "--"}
                      </TableCell>

                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="text-fg-muted tabular-nums">{load.open}</span>
                          {load.overdue > 0 ? (
                            <CountBadge tone="attention">{load.overdue}</CountBadge>
                          ) : null}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <PeoplePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            shown={result.rows.length}
          />
        </>
      )}
    </div>
  );
}
