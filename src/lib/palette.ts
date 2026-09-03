import "server-only";

import { eq, inArray, isNull } from "drizzle-orm";

import { getTranslations } from "next-intl/server";

import { db } from "@/db/client";
import { departments, memberships, users } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { withOrg } from "@/db/tenancy";
import type { PaletteEntry } from "@/components/shell/command-palette";

import type { Actor } from "./authz";
import { destinationsFor } from "./navigation";

/**
 * Everything the command palette can jump to.
 *
 * Loaded whole, once per page render. At the size of one agency this is a few
 * dozen rows, and holding it in the client makes every keystroke instant --
 * cheaper and steadier than a request per character. The moment an org outgrows
 * that, this becomes a server search behind the same `PaletteEntry` shape and
 * the palette itself does not change.
 *
 * People are fetched in two steps rather than one join: `memberships` is
 * tenant-owned and goes through `withOrg()`, which applies its own `where` and
 * so cannot be joined onto afterwards. `users` is global identity -- the same
 * person can belong to several organizations -- so reading it by the ids the
 * scoped query returned is correct rather than a workaround.
 */
export async function paletteIndex(actor: Actor): Promise<PaletteEntry[]> {
  const scope = withOrg(actor.organizationId);
  const nav = await getTranslations("Nav");

  const [projectRows, membershipRows, departmentRows] = await Promise.all([
    scope.selectFields(
      projects,
      { id: projects.id, key: projects.key, name: projects.name },
      isNull(projects.archivedAt),
    ),
    scope.selectFields(
      memberships,
      { userId: memberships.userId, jobTitle: memberships.jobTitle },
      eq(memberships.status, "active"),
    ),
    scope.selectFields(
      departments,
      { id: departments.id, slug: departments.slug, name: departments.name },
      isNull(departments.archivedAt),
    ),
  ]);

  const userIds = membershipRows.map((row) => row.userId);
  const people = userIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];

  const jobTitleByUser = new Map(membershipRows.map((row) => [row.userId, row.jobTitle]));

  return [
    // Every screen this person may open, whether or not it fits on their rail.
    // A manager has no Calendar destination -- five is the cap -- so without
    // this the only way there is to know the URL.
    ...destinationsFor(actor).map((destination) => ({
      id: `go:${destination.id}`,
      kind: "destination" as const,
      label: nav(destination.id),
      hint: null,
      href: destination.href,
    })),
    ...projectRows.map((project) => ({
      id: `project:${project.id}`,
      kind: "project" as const,
      label: project.name,
      hint: project.key,
      href: `/work/${project.key}`,
    })),
    ...people.map((person) => ({
      id: `person:${person.id}`,
      kind: "person" as const,
      label: person.name,
      hint: jobTitleByUser.get(person.id) ?? null,
      href: `/people/${person.id}`,
    })),
    ...departmentRows.map((department) => ({
      id: `department:${department.id}`,
      kind: "department" as const,
      label: department.name,
      hint: null,
      href: `/people?department=${department.slug}`,
    })),
  ];
}
