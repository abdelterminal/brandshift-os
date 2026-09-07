/**
 * Empty the database, and put nothing back.
 *
 * Run with `npm run db:reset`. This is `db:seed` without the second half: the
 * same truncate, and then it stops. It exists for the moment an installation
 * stops being a demo -- you clear the invented agency out and create the real
 * one through the app, so that every person, project and task in there is one
 * somebody actually meant.
 *
 * Afterwards the database has no organizations and no users at all. That is a
 * supported state rather than a broken one: `/signup` creates an organization
 * and its founding owner in a single transaction, which is the only way in and
 * the only way this was ever meant to be bootstrapped.
 *
 * What it does *not* do is touch the schema. Migrations stay applied, so there
 * is no `db:migrate` to run afterwards.
 */

import { sql } from "drizzle-orm";

import { closeDb, db } from "./client";
import {
  activityEvents,
  channelMembers,
  channels,
  companies,
  contacts,
  deals,
  departments,
  expenses,
  invoiceLines,
  invoices,
  leaveRequests,
  meetingAttendees,
  meetings,
  memberships,
  messages,
  notifications,
  organizations,
  projectMembers,
  projects,
  quoteLines,
  quotes,
  sessions,
  tasks,
  users,
} from "./schema";

async function main() {
  // The same guard the seed has. Emptying a production database is a thing
  // somebody should have to say twice.
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error(
      "Refusing to reset with NODE_ENV=production. Pass --force if that is genuinely what you want.",
    );
  }

  const [before] = await db
    .select({
      organizations: sql<number>`(select count(*) from ${organizations})`,
      users: sql<number>`(select count(*) from ${users})`,
      projects: sql<number>`(select count(*) from ${projects})`,
      tasks: sql<number>`(select count(*) from ${tasks})`,
      quotes: sql<number>`(select count(*) from ${quotes})`,
      invoices: sql<number>`(select count(*) from ${invoices})`,
    })
    .from(sql`(select 1) as one`);

  console.log("Clearing:");
  for (const [table, count] of Object.entries(before ?? {})) {
    console.log(`  ${String(count).padStart(4)}  ${table}`);
  }

  /*
    One statement, so foreign keys never see a half-empty graph. The list is
    the seed's, for the same reason: `cascade` would reach most of these
    through `organizations` anyway, but naming them is what makes it reviewable
    -- a table that quietly stops being cleared is a table that leaks rows from
    the last tenant into the next one. `users` is not tenant-owned and so has
    to be named explicitly.
  */
  await db.execute(sql`
    truncate table
      ${expenses}, ${invoiceLines}, ${invoices}, ${quoteLines}, ${quotes},
      ${deals}, ${contacts}, ${companies},
      ${leaveRequests},
      ${meetingAttendees}, ${meetings},
      ${messages}, ${channelMembers}, ${channels},
      ${notifications}, ${activityEvents}, ${tasks}, ${projectMembers}, ${projects},
      ${sessions}, ${memberships}, ${departments}, ${users}, ${organizations}
    restart identity cascade
  `);

  const [after] = await db
    .select({
      organizations: sql<number>`(select count(*) from ${organizations})`,
      users: sql<number>`(select count(*) from ${users})`,
    })
    .from(sql`(select 1) as one`);

  if (Number(after?.organizations) !== 0 || Number(after?.users) !== 0) {
    throw new Error(
      `Reset did not empty the database: ${after?.organizations} organizations, ${after?.users} users remain.`,
    );
  }

  console.log("\nThe database is empty.");
  console.log("Open /signup to create your organization and its first owner.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
