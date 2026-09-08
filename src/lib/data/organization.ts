import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import type { Actor } from "@/lib/authz";
import { withBasePath } from "@/lib/base-path";

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

/**
 * `organizations.logo_url` holds a root-relative path for a logo the app
 * itself serves out of `public/` -- the only kind there is a way to set today
 * -- or, in principle, a full external URL. Only the former needs the base
 * path: a root-relative `<img src>` resolves against the domain root, not
 * against `NEXT_PUBLIC_BASE_PATH`, so a sub-path deployment would otherwise
 * ask the host for a file one level too high. An absolute URL already names
 * its own host and is left untouched.
 */
function resolveLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl || !logoUrl.startsWith("/") || logoUrl.startsWith("//")) return logoUrl;
  return withBasePath(logoUrl);
}

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
    (row && { ...row, logoUrl: resolveLogoUrl(row.logoUrl) }) ?? {
      name: "",
      logoUrl: null,
      tagline: null,
      city: null,
      website: null,
      contactEmail: null,
    }
  );
}
