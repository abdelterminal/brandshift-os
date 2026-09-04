import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import type { Actor } from "@/lib/authz";

/**
 * What the organization calls itself on a document it sends out.
 *
 * Read straight from `organizations` rather than through `withOrg()`, and that
 * is not an exception to tenancy: `organizations` is the tenant root, so it
 * has no `organization_id` to filter by -- its primary key *is* the scope.
 * Filtering by `actor.organizationId` is therefore exactly as narrow as
 * `withOrg()` would be, and returns at most the one row the actor is in.
 *
 * It is not on the session. The session is read on every render of every
 * screen; a letterhead is read by two routes that print. Putting it there
 * would make every page in the app pay for the quote view.
 */
export type Letterhead = {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  city: string | null;
  website: string | null;
  contactEmail: string | null;
};

export async function getLetterhead(actor: Actor): Promise<Letterhead> {
  const [row] = await db
    .select({
      name: organizations.name,
      logoUrl: organizations.logoUrl,
      tagline: organizations.tagline,
      city: organizations.city,
      website: organizations.website,
      contactEmail: organizations.contactEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .limit(1);

  // The actor's own organization always exists -- they are holding a session
  // scoped to it -- but the type should not depend on that being true forever.
  return (
    row ?? {
      name: "",
      logoUrl: null,
      tagline: null,
      city: null,
      website: null,
      contactEmail: null,
    }
  );
}
