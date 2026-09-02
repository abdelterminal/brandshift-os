import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { findMembershipsForUser } from "@/db/tenancy";
import { users } from "@/db/schema/people";

import type { Actor } from "./authz";

/**
 * Who is signed in.
 *
 * TEMPORARY. There is no authentication yet -- that is M4, which replaces the
 * body of `getCurrentUser()` with the cookie JWT plus the `sessions` digest
 * check. Everything above this function is written against the shape it
 * returns, so M4 changes this file and nothing else.
 *
 * Until then it reads a real person out of the seeded organization, so the
 * shell renders real names, a real role and a real org rather than invented
 * ones. `DEV_USER_EMAIL` picks which seeded person, which is how both the
 * admin and the member rail can be looked at before sign-in exists.
 */

export type CurrentUser = {
  actor: Actor;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    locale: "en" | "fr" | null;
  };
  membership: {
    role: Actor["role"];
    jobTitle: string | null;
    departmentId: string | null;
  };
  organization: { id: string; name: string; slug: string };
  /** Every org this person belongs to, for the switcher. */
  organizations: Array<{ id: string; name: string; slug: string }>;
};

export class NoSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSessionError";
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const email = process.env.DEV_USER_EMAIL;

  const [person] = email
    ? await db.select().from(users).where(eq(users.email, email)).limit(1)
    : await db.select().from(users).orderBy(users.createdAt).limit(1);

  if (!person) {
    throw new NoSessionError(
      "No users in the database. Run `npm run db:migrate && npm run db:seed`.",
    );
  }

  const memberships = await findMembershipsForUser(person.id);
  const current = memberships[0];

  if (!current) {
    throw new NoSessionError(`${person.email} has no active membership in any organization.`);
  }

  return {
    actor: {
      userId: person.id,
      organizationId: current.organizationId,
      role: current.role,
      permissions: current.permissions,
    },
    user: {
      id: person.id,
      name: person.name,
      email: person.email,
      avatarUrl: person.avatarUrl,
      locale: person.locale,
    },
    membership: {
      role: current.role,
      jobTitle: current.jobTitle,
      departmentId: current.departmentId,
    },
    organization: {
      id: current.organizationId,
      name: current.organizationName,
      slug: current.organizationSlug,
    },
    organizations: memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      slug: membership.organizationSlug,
    })),
  };
}
