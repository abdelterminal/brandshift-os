import "server-only";

import { eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";

import { departments, memberships, users } from "@/db/schema/people";
import { withOrg } from "@/db/tenancy";

import type { Actor } from "../authz";
import type { ModulePermissions, Role } from "@/db/schema/people";
import { isUuid } from "@/lib/uuid";
import { seesOnlyOwnWork, teammateIds } from "./visibility";

/**
 * People reads.
 *
 * The directory is the org chart, so every member can read it. What the
 * `people` module flag gates is the sensitive half of a person's record, which
 * arrives with contracts and salaries rather than here.
 */

export type PersonRow = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  permissions: ModulePermissions;
  jobTitle: string | null;
  status: "invited" | "active" | "suspended";
  departmentId: string | null;
  departmentName: string | null;
  joinedAt: Date | null;
};

const PERSON_FIELDS = {
  userId: memberships.userId,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  role: memberships.role,
  permissions: memberships.permissions,
  jobTitle: memberships.jobTitle,
  status: memberships.status,
  departmentId: memberships.departmentId,
  departmentName: departments.name,
  joinedAt: memberships.joinedAt,
};

const PERSON_JOINS = [
  { table: users, on: eq(users.id, memberships.userId), type: "inner" as const },
  // Left: someone can be in the organization without a department yet.
  { table: departments, on: eq(departments.id, memberships.departmentId), type: "left" as const },
];

export type PeopleFilter = {
  /** Free text over name and email. */
  query?: string;
  departmentId?: string;
  role?: Role;
  /** Page number, 1-based. */
  page?: number;
  pageSize?: number;
};

export const DEFAULT_PAGE_SIZE = 25;

function peopleConditions(filter: PeopleFilter): Array<SQL | undefined> {
  const trimmed = filter.query?.trim();

  return [
    // Invited people are shown; suspended ones are not part of the directory.
    or(eq(memberships.status, "active"), eq(memberships.status, "invited")),
    trimmed
      ? or(ilike(users.name, `%${trimmed}%`), ilike(users.email, `%${trimmed}%`))
      : undefined,
    filter.departmentId ? eq(memberships.departmentId, filter.departmentId) : undefined,
    filter.role ? eq(memberships.role, filter.role) : undefined,
  ];
}

/**
 * The directory, one page at a time.
 *
 * Server-paginated rather than filtered in the browser: a list that ships every
 * employee to the client is fine at twelve people and a problem at four
 * hundred, and the shape of the screen should not change when it gets there.
 */
export async function listPeople(
  actor: Actor,
  filter: PeopleFilter = {},
): Promise<{ rows: PersonRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filter.pageSize ?? DEFAULT_PAGE_SIZE));
  const conditions = peopleConditions(filter);
  const scope = withOrg(actor.organizationId);

  const [all, total] = await Promise.all([
    scope.selectJoined(memberships, PERSON_FIELDS, PERSON_JOINS, ...conditions) as Promise<
      PersonRow[]
    >,
    scope.count(memberships, ...conditions),
  ]);

  // Sorted and sliced here rather than in SQL: `selectJoined` deliberately
  // ends at `where` so the tenant filter is always the last word, and at
  // directory scale the difference is not measurable. If it ever is, the sort
  // and limit move into the helper rather than into each caller.
  all.sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows: all.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
  };
}

/** One person's membership in this organization, or null if they are not in it. */
export async function getPerson(actor: Actor, userId: string): Promise<PersonRow | null> {
  // A malformed id is a missing row, not a server error -- see `isUuid`.
  if (!isUuid(userId)) return null;

  const rows = (await withOrg(actor.organizationId).selectJoined(
    memberships,
    PERSON_FIELDS,
    PERSON_JOINS,
    eq(memberships.userId, userId),
  )) as PersonRow[];

  return rows[0] ?? null;
}

export type DepartmentRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
};

export async function listDepartments(actor: Actor): Promise<DepartmentRow[]> {
  const rows = await withOrg(actor.organizationId).selectFields(
    departments,
    {
      id: departments.id,
      slug: departments.slug,
      name: departments.name,
      description: departments.description,
      leadUserId: departments.leadUserId,
    },
    isNull(departments.archivedAt),
  );

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Everyone who can be assigned work, for pickers. A member only ever sees the
 * people they share a project with -- the reassignment combobox is not a way
 * around the roster being narrowed everywhere else.
 */
export async function listAssignablePeople(actor: Actor): Promise<PersonRow[]> {
  const rows = (await withOrg(actor.organizationId).selectJoined(
    memberships,
    PERSON_FIELDS,
    PERSON_JOINS,
    eq(memberships.status, "active"),
    seesOnlyOwnWork(actor)
      ? inArray(memberships.userId, await teammateIds(actor))
      : undefined,
  )) as PersonRow[];

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** How many people are in the organization, by role. */
export async function countByRole(actor: Actor): Promise<Record<Role, number>> {
  const rows = await withOrg(actor.organizationId).selectFields(
    memberships,
    { role: memberships.role },
    eq(memberships.status, "active"),
  );

  const counts: Record<Role, number> = { owner: 0, admin: 0, manager: 0, member: 0 };
  for (const row of rows) counts[row.role] += 1;
  return counts;
}
