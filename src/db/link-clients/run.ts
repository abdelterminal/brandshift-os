import { eq, isNull } from "drizzle-orm";

import { closeDb, db } from "../client";
import { companies, organizations, projects, users } from "../schema";
import { withOrg } from "../tenancy";
import { slugify } from "../../lib/slug";

/**
 * Give every client project a client.
 *
 * The CRM side started empty while the work did not: twenty-nine projects,
 * each already named after the business it was for, and not one of them
 * attached to a company. So the pipeline board was blank, a client's page did
 * not exist, and the client brief had nowhere to live -- all for want of rows
 * nobody wanted to type twice.
 *
 * This creates one company per client and points the project at it. It reads
 * the project's own name as the client's name, because that is what they
 * already are.
 *
 * **Dry run unless `--commit` is passed**, and idempotent either way: a
 * project that already has a company is left alone, and a company that
 * already exists is reused rather than duplicated. Running it twice changes
 * nothing the second time, which is what makes it safe to rehearse against a
 * copy and then run for real.
 *
 *   npm run db:link-clients              # show what would happen
 *   npm run db:link-clients -- --commit  # do it
 */

/**
 * Projects that are our own work, not a client's.
 *
 * `projects.companyId` is nullable on purpose -- DECISIONS.md: "an internal
 * build does not run the client flow", and one simply never appears on the
 * pipeline board. Making Mediast a client of itself would put our own
 * roadmap on the sales board.
 */
const INTERNAL = new Set(["Mediast Creative", "Mediast OS", "SaaS Mediast"]);

/**
 * Where two projects are one business.
 *
 * Deliberately a short, explicit list rather than fuzzy matching on names:
 * "Bocadios El Jefe" and "El Jefe" are the same client and a human said so.
 * Guessing that two names mean one business is exactly the kind of thing a
 * script gets wrong at three in the morning, so it does not guess.
 */
const SAME_CLIENT: Record<string, string> = {
  "Bocadios El Jefe": "El Jefe",
};

const commit = process.argv.includes("--commit");

async function main() {
  const [organization] = await db.select().from(organizations).limit(1);
  if (!organization) throw new Error("No organization found.");

  // Somebody has to own the rows. The owner, or the first account there is.
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) throw new Error("No users found.");

  const actor = { organizationId: organization.id, userId: owner.id };
  const scope = withOrg(actor.organizationId);

  const all = await scope.select(projects);
  const existing = await scope.select(companies);
  const byName = new Map(existing.map((company) => [company.name, company]));

  const plan: Array<{ project: string; client: string; newCompany: boolean }> = [];
  const skipped: Array<{ project: string; why: string }> = [];

  for (const project of all.sort((a, b) => a.name.localeCompare(b.name))) {
    if (project.companyId) {
      skipped.push({ project: project.name, why: "already has a client" });
      continue;
    }
    if (INTERNAL.has(project.name)) {
      skipped.push({ project: project.name, why: "our own work -- no client by design" });
      continue;
    }

    const clientName = SAME_CLIENT[project.name] ?? project.name;
    plan.push({
      project: project.name,
      client: clientName,
      newCompany: !byName.has(clientName) && !plan.some((row) => row.client === clientName),
    });
  }

  console.log(`\n${commit ? "LINKING" : "DRY RUN -- nothing will be written"}\n`);
  console.log(`Organization: ${organization.name}`);
  console.log(`Projects: ${all.length}\n`);

  for (const row of plan) {
    const arrow = row.project === row.client ? "" : `  (as "${row.client}")`;
    console.log(`  ${row.newCompany ? "+" : " "} ${row.project}${arrow}`);
  }

  console.log(`\n  ${plan.filter((r) => r.newCompany).length} clients to create`);
  console.log(`  ${plan.length} projects to link`);

  if (skipped.length > 0) {
    console.log("\nLeft alone:");
    for (const row of skipped) console.log(`    ${row.project} -- ${row.why}`);
  }

  if (!commit) {
    console.log("\nRe-run with --commit to write it.\n");
    return;
  }

  // One transaction: either every project gains its client or none does.
  // A half-linked pipeline is worse than an empty one, because it looks
  // finished.
  await db.transaction(async (tx) => {
    const txScope = withOrg(actor.organizationId, tx);
    const created = new Map(byName);

    for (const row of plan) {
      let company = created.get(row.client);

      if (!company) {
        const [made] = await txScope.insert(companies, {
          name: row.client,
          slug: await uniqueSlug(txScope, row.client, created),
          // They are clients, not prospects: there is already work for them.
          status: "client" as const,
          ownerUserId: owner.id,
          createdByUserId: owner.id,
        });
        if (!made) throw new Error(`Could not create the client "${row.client}"`);
        company = made;
        created.set(row.client, made);
      }

      await txScope.update(
        projects,
        { companyId: company.id, updatedAt: new Date() },
        eq(projects.name, row.project),
        // Belt and braces: never overwrite a client somebody set by hand
        // between the dry run and this.
        isNull(projects.companyId),
      );
    }
  });

  console.log("\nDone.\n");
}

/**
 * A slug nothing else has taken, counting the ones made in this run.
 *
 * `companies.slug` is unique per organization, and the rows created inside
 * this transaction are not visible to a query against the committed table --
 * so the names made so far are carried in a map rather than read back.
 */
async function uniqueSlug(
  scope: ReturnType<typeof withOrg>,
  name: string,
  madeSoFar: Map<string, { slug: string }>,
): Promise<string> {
  const taken = new Set([
    ...(await scope.selectFields(companies, { slug: companies.slug })).map((row) => row.slug),
    ...[...madeSoFar.values()].map((company) => company.slug),
  ]);

  const base = slugify(name, "company");
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  }
  throw new Error(`Could not find a free slug for "${name}"`);
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
