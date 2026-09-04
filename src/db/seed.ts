/**
 * Demo data for development.
 *
 * Run with `npm run db:seed`. Destructive: it clears the tables it owns and
 * rebuilds them, so the result is identical on every machine. The randomness is
 * seeded from a fixed constant for the same reason -- a screenshot taken today
 * and one taken next week differ only by the dates that are meant to move.
 *
 * Dates are relative to the day it runs, so "overdue" is genuinely overdue and
 * "due soon" is genuinely soon, however long the data has been sitting there.
 *
 * Writes go through `withOrg()` like everything else. The seed is not exempt
 * from tenancy; it is the first proof that the scoped path works.
 */

import { sql } from "drizzle-orm";

import { closeDb, db } from "./client";
import {
  BLOCKER_REASONS,
  CHANNEL_MESSAGES,
  DEPARTMENTS,
  COMPANIES,
  CONTACTS,
  DEALS,
  EXPENSES,
  GENERAL_CHANNEL,
  INVOICES,
  LEAVE,
  MEETINGS,
  QUOTES,
  ORGANIZATION,
  PERSONAL_TASKS,
  PROJECTS,
  TASK_TITLES,
  USERS,
  type DepartmentSlug,
} from "./seed-data";
import {
  activityEvents,
  channelMembers,
  channels,
  companies,
  contacts,
  deals,
  quoteLines,
  quotes,
  departments,
  expenses,
  invoiceLines,
  invoices,
  leaveRequests,
  meetingAttendees,
  meetings,
  messages,
  notifications,
  memberships,
  organizations,
  projectMembers,
  projects,
  sessions,
  tasks,
  users,
  type NewActivityEvent,
  keyResultCheckpoints,
  keyResults,
  objectives,
  sopSteps,
  sops,
  projectTemplates,
  templateTasks,
  weeklyReviews,
  reviewDecisions,
  type NewTask,
} from "./schema";
import { withOrg } from "./tenancy";
import { hashPassword } from "@/lib/password";
import { addDays, instantFromLocal } from "@/lib/calendar-dates";
import { lineTotal, parseMoney, parseQuantity, toDecimalString, totalsFor } from "@/lib/money";
import { workingDays } from "@/lib/leave-days";
import { slugify } from "@/lib/slug";

/** Every seeded account shares this password. Development only. */
const DEMO_PASSWORD = "brandshift";

/** Fixed so two runs on the same day produce byte-identical data. */
const RANDOM_SEED = 0x5b7f_2c11;

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

/** mulberry32: tiny, seeded, good enough for arranging demo rows. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = createRandom(RANDOM_SEED);

/** Integer in [min, max]. */
function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

const TODAY = new Date();

/** `YYYY-MM-DD`, `offsetDays` from today. Postgres `date` columns take strings. */
function day(offsetDays: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** A timestamp `offsetDays` from now, at a plausible hour of the working day. */
function moment(offsetDays: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(randomInt(9, 18), randomInt(0, 59), 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error(
      "Refusing to seed with NODE_ENV=production. Pass --force if that is genuinely what you want.",
    );
  }

  console.log("Clearing existing data...");
  // One statement so foreign keys never see a half-empty graph. `users` is not
  // tenant-owned but is seeded here, so it is cleared here too.
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

  // --- Organization ------------------------------------------------------
  const [organization] = await db
    .insert(organizations)
    .values({
      slug: ORGANIZATION.slug,
      name: ORGANIZATION.name,
      timezone: ORGANIZATION.timezone,
      defaultLocale: ORGANIZATION.defaultLocale,
    })
    .returning();

  if (!organization) throw new Error("Failed to create the organization.");
  const scope = withOrg(organization.id);
  console.log(`Created organization ${organization.name} (${organization.id})`);

  // --- Users -------------------------------------------------------------
  // Hashing is intentionally slow, so all twelve are hashed once, in parallel.
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const insertedUsers = await db
    .insert(users)
    .values(
      USERS.map((person) => ({
        email: person.email,
        name: person.name,
        passwordHash,
        locale: person.locale,
        createdAt: moment(-randomInt(120, 400)),
        lastLoginAt: moment(-randomInt(0, 6)),
      })),
    )
    .returning();

  /** email -> user id, the key everything below joins on. */
  const userIdByEmail = new Map(insertedUsers.map((user) => [user.email, user.id]));
  const userId = (email: string): string => {
    const id = userIdByEmail.get(email);
    if (!id) throw new Error(`Unknown seed user: ${email}`);
    return id;
  };

  // --- Departments -------------------------------------------------------
  const insertedDepartments = await scope.insert(
    departments,
    DEPARTMENTS.map((department) => ({
      slug: department.slug,
      name: department.name,
    })),
  );

  const departmentIdBySlug = new Map(
    insertedDepartments.map((department) => [department.slug as DepartmentSlug, department.id]),
  );
  const departmentId = (slug: DepartmentSlug): string => {
    const id = departmentIdBySlug.get(slug);
    if (!id) throw new Error(`Unknown seed department: ${slug}`);
    return id;
  };

  // --- Memberships -------------------------------------------------------
  await scope.insert(
    memberships,
    USERS.map((person) => ({
      userId: userId(person.email),
      departmentId: departmentId(person.department),
      role: person.role,
      permissions: person.permissions,
      jobTitle: person.jobTitle,
      status: "active" as const,
      isFounder: person.role === "owner",
      invitedAt: moment(-randomInt(120, 400)),
      joinedAt: moment(-randomInt(60, 119)),
    })),
  );

  // Department leads, now that their memberships exist.
  for (const person of USERS.filter((candidate) => candidate.leads)) {
    await scope.update(
      departments,
      { leadUserId: userId(person.email) },
      sql`${departments.slug} = ${person.department}`,
    );
  }

  console.log(
    `Created ${insertedUsers.length} people across ${insertedDepartments.length} departments`,
  );

  // --- Projects ----------------------------------------------------------
  const insertedProjects = await scope.insert(
    projects,
    PROJECTS.map((project) => ({
      key: project.key,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      departmentId: departmentId(project.department),
      ownerUserId: userId(project.ownerEmail),
      createdByUserId: userId(project.ownerEmail),
      startDate: day(project.startsInDays),
      dueDate: project.dueInDays === null ? null : day(project.dueInDays),
      completedAt: project.status === "completed" ? moment((project.dueInDays ?? 0) - 1) : null,
      createdAt: moment(project.startsInDays - 3),
    })),
  );

  const projectByKey = new Map(insertedProjects.map((project) => [project.key, project]));

  await scope.insert(
    projectMembers,
    PROJECTS.flatMap((project) => {
      const row = projectByKey.get(project.key)!;
      return [
        { projectId: row.id, userId: userId(project.ownerEmail), role: "lead" as const },
        ...project.memberEmails.map((email) => ({
          projectId: row.id,
          userId: userId(email),
          role: "contributor" as const,
        })),
      ];
    }),
  );

  console.log(`Created ${insertedProjects.length} projects`);

  // --- Tasks -------------------------------------------------------------
  const taskRows: Array<Omit<NewTask, "organizationId">> = [];

  for (const project of PROJECTS) {
    const row = projectByKey.get(project.key)!;
    const titles = TASK_TITLES[project.key] ?? [];
    // The owner plus the team; anyone on the project can hold a task.
    const candidates = [project.ownerEmail, ...project.memberEmails];

    titles.forEach((title, index) => {
      const progress = titles.length === 1 ? 1 : index / (titles.length - 1);
      const {
        status,
        dueInDays,
        assigneeEmail,
      }: {
        status: NewTask["status"];
        dueInDays: number | null;
        assigneeEmail: string | null;
      } = planTask(project, progress, candidates, index);

      const isDone = status === "done";
      const isBlocked = status === "blocked";

      taskRows.push({
        projectId: row.id,
        title,
        status,
        priority: planPriority(project.priority, progress),
        assigneeUserId: assigneeEmail ? userId(assigneeEmail) : null,
        createdByUserId: userId(project.ownerEmail),
        dueDate: dueInDays === null ? null : day(dueInDays),
        estimateHours: String(randomInt(2, 32)),
        position: index,
        startedAt:
          status === "todo" ? null : moment(Math.min(-1, (dueInDays ?? 0) - randomInt(3, 10))),
        completedAt: isDone ? moment(Math.min(-1, (dueInDays ?? -2) + randomInt(0, 2))) : null,
        blockedReason: isBlocked ? pick(BLOCKER_REASONS) : null,
        blockedAt: isBlocked ? moment(-randomInt(1, 9)) : null,
        createdAt: moment(project.startsInDays + index),
      });
    });
  }

  // Personal to-dos, sitting outside any project.
  for (const [index, personal] of PERSONAL_TASKS.entries()) {
    taskRows.push({
      projectId: null,
      title: personal.title,
      status: index === 0 ? "in_progress" : "todo",
      priority: "low",
      assigneeUserId: userId(personal.assigneeEmail),
      createdByUserId: userId(personal.assigneeEmail),
      // Half of these have no deadline at all -- the "No deadline" bucket.
      dueDate: index % 2 === 0 ? day(randomInt(2, 14)) : null,
      position: index,
      createdAt: moment(-randomInt(3, 20)),
    });
  }

  const insertedTasks = await scope.insert(tasks, taskRows);
  console.log(`Created ${insertedTasks.length} tasks`);

  // --- Activity ----------------------------------------------------------
  // One event per project creation and per task that has actually moved. This
  // is the spine Phase 2 channels attach to, so it is populated from day one.
  const events: Array<Omit<NewActivityEvent, "organizationId">> = [];

  for (const project of PROJECTS) {
    const row = projectByKey.get(project.key)!;
    events.push({
      actorUserId: userId(project.ownerEmail),
      verb: "project.created",
      subjectType: "project",
      subjectId: row.id,
      projectId: row.id,
      metadata: { name: project.name, key: project.key },
      createdAt: row.createdAt,
    });
  }

  for (const task of insertedTasks) {
    if (!task.assigneeUserId) continue;

    events.push({
      actorUserId: task.createdByUserId,
      verb: "task.assigned",
      subjectType: "task",
      subjectId: task.id,
      projectId: task.projectId,
      taskId: task.id,
      metadata: { assigneeUserId: task.assigneeUserId },
      createdAt: task.createdAt,
    });

    if (task.status === "done" && task.completedAt) {
      events.push({
        actorUserId: task.assigneeUserId,
        verb: "task.completed",
        subjectType: "task",
        subjectId: task.id,
        projectId: task.projectId,
        taskId: task.id,
        metadata: {},
        createdAt: task.completedAt,
      });
    }

    if (task.status === "blocked" && task.blockedAt) {
      events.push({
        actorUserId: task.assigneeUserId,
        verb: "task.blocked",
        subjectType: "task",
        subjectId: task.id,
        projectId: task.projectId,
        taskId: task.id,
        metadata: { reason: task.blockedReason },
        createdAt: task.blockedAt,
      });
    }
  }

  const insertedEvents = await scope.insert(activityEvents, events);
  console.log(`Created ${insertedEvents.length} activity events`);

  // --- Notifications -----------------------------------------------------
  // Fanned out with the same rules the app uses, so a fresh inbox looks like
  // one the app produced rather than a list of rows nobody would have been
  // sent. Anything older than a week is already read; the recent handful is
  // not, which is what puts a plausible number on the rail.
  const assigneeByTask = new Map(insertedTasks.map((task) => [task.id, task.assigneeUserId]));
  const ownerByProject = new Map(
    PROJECTS.map((project) => [projectByKey.get(project.key)!.id, userId(project.ownerEmail)]),
  );

  const oneWeekAgo = Date.now() - 7 * 86_400_000;
  const notificationRows: Array<Omit<typeof notifications.$inferInsert, "organizationId">> = [];

  for (const event of insertedEvents) {
    const recipients = new Set<string>();
    const assignee = event.taskId ? assigneeByTask.get(event.taskId) : null;
    const owner = event.projectId ? ownerByProject.get(event.projectId) : null;

    if (event.verb === "task.assigned" && assignee) recipients.add(assignee);
    if (event.verb === "task.blocked") {
      if (assignee) recipients.add(assignee);
      if (owner) recipients.add(owner);
    }
    if (event.verb === "task.completed" && owner) recipients.add(owner);

    // Nobody is told what they did themselves.
    if (event.actorUserId) recipients.delete(event.actorUserId);

    for (const recipient of recipients) {
      notificationRows.push({
        userId: recipient,
        activityEventId: event.id,
        readAt: event.createdAt.getTime() < oneWeekAgo ? event.createdAt : null,
        createdAt: event.createdAt,
      });
    }
  }

  if (notificationRows.length > 0) {
    await scope.insert(notifications, notificationRows);
  }
  const unread = notificationRows.filter((row) => row.readAt === null).length;
  console.log(`Created ${notificationRows.length} notifications (${unread} unread)`);

  // --- Channels ----------------------------------------------------------
  // One channel per project, plus the general room. Project members are put in
  // theirs the way the app does it, so the rail on a fresh database looks like
  // the rail after a week of use rather than like an empty product tour.
  const channelRows = await scope.insert(channels, [
    ...PROJECTS.map((project) => ({
      kind: "project" as const,
      projectId: projectByKey.get(project.key)!.id,
      name: project.name,
      slug: slugify(project.name, project.key),
      createdByUserId: userId(project.ownerEmail),
    })),
    {
      kind: "general" as const,
      projectId: null,
      name: GENERAL_CHANNEL.name,
      slug: GENERAL_CHANNEL.slug,
      description: GENERAL_CHANNEL.description,
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
  ]);

  const channelByProjectKey = new Map(
    PROJECTS.map((project) => [
      project.key,
      channelRows.find((row) => row.projectId === projectByKey.get(project.key)!.id)!,
    ]),
  );
  const generalChannel = channelRows.find((row) => row.kind === "general")!;

  // Everyone is in General; a project channel holds that project's team. Read
  // marks sit six hours back, which leaves the last message or two of the busy
  // channels genuinely unread and the quiet ones clear -- the mix a real rail
  // shows, rather than every badge lit or none.
  const readMark = new Date(Date.now() - 6 * 3_600_000);

  const memberRows = [
    ...USERS.map((person) => ({
      channelId: generalChannel.id,
      userId: userId(person.email),
      lastReadAt: readMark,
    })),
    ...PROJECTS.flatMap((project) => {
      const channel = channelByProjectKey.get(project.key)!;
      const team = [...new Set([project.ownerEmail, ...project.memberEmails])];
      return team.map((email) => ({
        channelId: channel.id,
        userId: userId(email),
        lastReadAt: readMark,
      }));
    }),
  ];

  await scope.insert(channelMembers, memberRows);

  const messageRows = [
    ...Object.entries(CHANNEL_MESSAGES).flatMap(([key, said]) => {
      const channel = channelByProjectKey.get(key);
      if (!channel) throw new Error(`Seeded messages for unknown project: ${key}`);
      return said.map((message) => ({
        channelId: channel.id,
        authorUserId: userId(message.authorEmail),
        body: message.body,
        createdAt: new Date(Date.now() - message.minutesAgo * 60_000),
      }));
    }),
    ...GENERAL_CHANNEL.messages.map((message) => ({
      channelId: generalChannel.id,
      authorUserId: userId(message.authorEmail),
      body: message.body,
      createdAt: new Date(Date.now() - message.minutesAgo * 60_000),
    })),
  ];

  await scope.insert(messages, messageRows);
  console.log(
    `Created ${channelRows.length} channels, ${memberRows.length} memberships, ${messageRows.length} messages`,
  );

  // --- Meetings ----------------------------------------------------------
  // Either side of today, so the calendar has a past with notes in it and a
  // future with invitations to answer. Times are the organization's clock:
  // "10:00" means ten in the studio, whatever zone the seed runs in.
  const todayInOrg = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORGANIZATION.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  function meetingStart(inDays: number, at: string): Date {
    const day = new Date(`${todayInOrg}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + inDays);
    const startsAt = instantFromLocal(
      `${day.toISOString().slice(0, 10)}T${at}`,
      ORGANIZATION.timezone,
    );
    if (!startsAt) throw new Error(`Unusable seeded meeting time: ${at}`);
    return startsAt;
  }

  const meetingRows = await scope.insert(
    meetings,
    MEETINGS.map((meeting) => {
      const startsAt = meetingStart(meeting.inDays, meeting.at);
      return {
        title: meeting.title,
        agenda: meeting.agenda,
        startsAt,
        endsAt: new Date(startsAt.getTime() + meeting.minutes * 60_000),
        location: meeting.location,
        projectId: meeting.projectKey ? projectByKey.get(meeting.projectKey)!.id : null,
        organizerUserId: userId(meeting.organizerEmail),
        createdByUserId: userId(meeting.organizerEmail),
        notes: meeting.notes ?? null,
        cancelledAt: meeting.cancelled ? new Date() : null,
      };
    }),
  );

  const attendeeRows = MEETINGS.flatMap((meeting, index) => {
    const row = meetingRows[index]!;
    const organizer = userId(meeting.organizerEmail);

    return [
      // The organizer is always going; that is what calling it means.
      {
        meetingId: row.id,
        userId: organizer,
        response: "accepted" as const,
        respondedAt: row.createdAt,
      },
      ...meeting.attendeeEmails.map((email, position) => ({
        meetingId: row.id,
        userId: userId(email),
        // A spread of answers, deterministic rather than random, so the
        // response badges and the "no reply yet" case are all on screen
        // somewhere on a fresh database.
        response: (meeting.inDays < 0
          ? "accepted"
          : position % 4 === 0
            ? "needs_action"
            : position % 4 === 3
              ? "tentative"
              : "accepted") as "accepted" | "needs_action" | "tentative",
        respondedAt: position % 4 === 0 && meeting.inDays >= 0 ? null : row.createdAt,
      })),
    ];
  });

  await scope.insert(meetingAttendees, attendeeRows);
  console.log(`Created ${meetingRows.length} meetings, ${attendeeRows.length} invitations`);

  // --- Time off ----------------------------------------------------------
  // Every status, so the screen exercises the states that are easiest to get
  // wrong: a refusal with a reason, a withdrawal, a half day, and something
  // still waiting for an answer.
  /**
   * Nudge a start onto a weekday.
   *
   * Offsets are counted in calendar days, so a request written as "eleven days
   * out" lands on a Saturday roughly two times in seven -- and a single-day
   * request on a Saturday costs nothing, which is exactly what `requestLeave`
   * refuses. Seeding rows the app itself would reject makes a screen that
   * cannot be reproduced by using it.
   */
  function onAWeekday(day: string): string {
    let at = day;
    while ([0, 6].includes(new Date(`${at}T00:00:00Z`).getUTCDay())) at = addDays(at, 1);
    return at;
  }

  const leaveRows = await scope.insert(
    leaveRequests,
    LEAVE.map((request) => {
      const startDate = onAWeekday(addDays(todayInOrg, request.startsInDays));
      // The span is kept, measured from the nudged start, so a fortnight stays
      // a fortnight rather than being clipped by the shift.
      const endDate = addDays(startDate, request.endsInDays - request.startsInDays);
      const halfDay = request.halfDay === true && startDate === endDate;
      const decided = request.status === "approved" || request.status === "declined";

      return {
        userId: userId(request.email),
        type: request.type,
        startDate,
        endDate,
        halfDay,
        // Counted by the same function the app uses, so a seeded balance and a
        // balance somebody produces by asking are the same arithmetic.
        workingDays: String(workingDays(startDate, endDate, halfDay)),
        reason: request.reason ?? null,
        status: request.status,
        decidedByUserId: decided ? userId(request.decidedByEmail!) : null,
        decidedAt: decided ? new Date() : null,
        decisionNote: request.decisionNote ?? null,
      };
    }),
  );

  console.log(`Created ${leaveRows.length} leave requests`);

  // --- CRM ---------------------------------------------------------------
  // Every stage represented, including two lost deals with their reasons: a
  // pipeline where each row looks the same never exercises the states that
  // matter, and the reasons are most of what a pipeline is for afterwards.
  const companyRows = await scope.insert(
    companies,
    COMPANIES.map((company) => ({
      name: company.name,
      slug: slugify(company.name, "company"),
      website: company.website,
      industry: company.industry,
      status: company.status,
      ownerUserId: userId(company.ownerEmail),
      notes: company.notes ?? null,
      createdByUserId: userId(company.ownerEmail),
    })),
  );

  const companyByName = new Map(
    COMPANIES.map((company, index) => [company.name, companyRows[index]!]),
  );

  const contactRows = await scope.insert(
    contacts,
    CONTACTS.map((contact) => ({
      name: contact.name,
      companyId: contact.companyName ? companyByName.get(contact.companyName)!.id : null,
      email: contact.email,
      phone: contact.phone,
      jobTitle: contact.jobTitle,
      createdByUserId: userId("sofia.laurent@brandshift.test"),
    })),
  );

  const contactByName = new Map(
    CONTACTS.map((contact, index) => [contact.name, contactRows[index]!]),
  );

  const dealRows = await scope.insert(
    deals,
    DEALS.map((deal) => {
      const closed = deal.stage === "won" || deal.stage === "lost";
      const closedAt =
        closed && deal.closesInDays !== null
          ? new Date(`${addDays(todayInOrg, deal.closesInDays)}T12:00:00Z`)
          : null;

      return {
        title: deal.title,
        companyId: companyByName.get(deal.companyName)!.id,
        primaryContactId: deal.contactName ? contactByName.get(deal.contactName)!.id : null,
        stage: deal.stage,
        // A string on the way in: `numeric` keeps its precision only if the
        // value never becomes a float.
        value: deal.value === null ? null : deal.value.toFixed(2),
        expectedCloseDate:
          deal.closesInDays === null ? null : addDays(todayInOrg, deal.closesInDays),
        ownerUserId: userId(deal.ownerEmail),
        source: deal.source,
        wonAt: deal.stage === "won" ? closedAt : null,
        lostAt: deal.stage === "lost" ? closedAt : null,
        lostReason: deal.lostReason ?? null,
        createdByUserId: userId(deal.ownerEmail),
      };
    }),
  );

  console.log(
    `Created ${companyRows.length} companies, ${contactRows.length} contacts, ${dealRows.length} deals`,
  );

  // --- Finance -----------------------------------------------------------
  // Amounts are written in the seed the way somebody would type them, and
  // parsed with the same functions the form uses -- so a seeded figure and a
  // typed one go through identical arithmetic, in integer cents.
  function toLines(raw: (typeof QUOTES)[number]["lines"]) {
    return raw.map((line) => {
      const quantityThousandths = parseQuantity(line.quantity);
      const unitPrice = parseMoney(line.unitPrice);
      if (quantityThousandths === null || unitPrice === null) {
        throw new Error(`Unusable seeded amount: ${line.quantity} x ${line.unitPrice}`);
      }
      return {
        quantityThousandths,
        unitPrice,
        taxRateBasisPoints: line.tax,
        description: line.description,
      };
    });
  }

  const quoteRows = await scope.insert(
    quotes,
    QUOTES.map((quote, index) => {
      const lines = toLines(quote.lines);
      const totals = totalsFor(lines);
      const issueDate = addDays(todayInOrg, quote.issuedInDays);
      const decided = quote.status === "accepted" || quote.status === "declined";

      return {
        number: `Q-${issueDate.slice(0, 4)}-${String(index + 1).padStart(4, "0")}`,
        companyId: companyByName.get(quote.companyName)!.id,
        title: quote.title,
        status: quote.status,
        issueDate,
        validUntil: quote.validForDays === null ? null : addDays(issueDate, quote.validForDays),
        subtotal: toDecimalString(totals.subtotal),
        taxTotal: toDecimalString(totals.tax),
        total: toDecimalString(totals.total),
        sentAt: quote.status === "draft" ? null : new Date(),
        decidedAt: decided ? new Date() : null,
        declineReason: quote.declineReason ?? null,
        ownerUserId: userId(quote.ownerEmail),
        createdByUserId: userId(quote.ownerEmail),
      };
    }),
  );

  await scope.insert(
    quoteLines,
    QUOTES.flatMap((quote, index) =>
      toLines(quote.lines).map((line, position) => ({
        quoteId: quoteRows[index]!.id,
        position,
        description: line.description,
        quantityThousandths: line.quantityThousandths,
        unitPrice: toDecimalString(line.unitPrice),
        taxRateBasisPoints: line.taxRateBasisPoints,
        lineTotal: toDecimalString(lineTotal(line.quantityThousandths, line.unitPrice)),
      })),
    ),
  );

  const invoiceRows = await scope.insert(
    invoices,
    INVOICES.map((invoice, index) => {
      const lines = toLines(invoice.lines);
      const totals = totalsFor(lines);
      const issueDate = addDays(todayInOrg, invoice.issuedInDays);
      const paid =
        invoice.status === "paid"
          ? totals.total
          : invoice.paid
            ? (parseMoney(invoice.paid) ?? 0)
            : 0;

      return {
        number: `INV-${issueDate.slice(0, 4)}-${String(index + 1).padStart(4, "0")}`,
        companyId: companyByName.get(invoice.companyName)!.id,
        projectId: invoice.projectKey ? projectByKey.get(invoice.projectKey)!.id : null,
        title: invoice.title,
        status: invoice.status,
        issueDate,
        dueDate: addDays(todayInOrg, invoice.dueInDays),
        subtotal: toDecimalString(totals.subtotal),
        taxTotal: toDecimalString(totals.tax),
        total: toDecimalString(totals.total),
        paidAmount: toDecimalString(paid),
        sentAt: invoice.status === "draft" ? null : new Date(),
        paidAt: invoice.status === "paid" ? new Date() : null,
        voidedAt: invoice.status === "void" ? new Date() : null,
        voidReason: invoice.voidReason ?? null,
        createdByUserId: userId("tom.decker@brandshift.test"),
      };
    }),
  );

  await scope.insert(
    invoiceLines,
    INVOICES.flatMap((invoice, index) =>
      toLines(invoice.lines).map((line, position) => ({
        invoiceId: invoiceRows[index]!.id,
        position,
        description: line.description,
        quantityThousandths: line.quantityThousandths,
        unitPrice: toDecimalString(line.unitPrice),
        taxRateBasisPoints: line.taxRateBasisPoints,
        lineTotal: toDecimalString(lineTotal(line.quantityThousandths, line.unitPrice)),
      })),
    ),
  );

  const expenseRows = await scope.insert(
    expenses,
    EXPENSES.map((expense) => {
      const amount = parseMoney(expense.amount);
      const tax = parseMoney(expense.tax);
      if (amount === null || tax === null) {
        throw new Error(`Unusable seeded expense: ${expense.amount}`);
      }

      return {
        description: expense.description,
        category: expense.category,
        spentOn: addDays(todayInOrg, expense.spentInDays),
        amount: toDecimalString(amount),
        taxAmount: toDecimalString(tax),
        supplier: expense.supplier,
        projectId: expense.projectKey ? projectByKey.get(expense.projectKey)!.id : null,
        paidByUserId: userId(expense.paidByEmail),
        reimbursable: expense.reimbursable,
        reimbursedAt: expense.reimbursed ? new Date() : null,
        createdByUserId: userId(expense.paidByEmail),
      };
    }),
  );

  console.log(
    `Created ${quoteRows.length} quotes, ${invoiceRows.length} invoices, ${expenseRows.length} expenses`,
  );

  // -------------------------------------------------------------------------
  // Objectives
  // -------------------------------------------------------------------------

  /**
   * Three objectives for the current quarter, deliberately in three different
   * states: one on track, one that has slipped, and one nobody has measured.
   *
   * The third is the important one. A seed where every bar is a cheerful blue
   * proves nothing about the screen -- "not measured" is the state this design
   * treats as distinct from zero, and it needs to be visible in development or
   * the distinction is never looked at.
   */
  const quarterStart = new Date(
    Date.UTC(TODAY.getUTCFullYear(), Math.floor(TODAY.getUTCMonth() / 3) * 3, 1),
  );
  const quarterEnd = new Date(
    Date.UTC(TODAY.getUTCFullYear(), Math.floor(TODAY.getUTCMonth() / 3) * 3 + 3, 0),
  );
  const asDay = (value: Date) => value.toISOString().slice(0, 10);

  const objectiveRows = await scope.insert(objectives, [
    {
      title: "Win back the retainer clients we lost last year",
      description:
        "Two of the three left over slow delivery rather than price. Fix the delivery story, then go back to them.",
      periodStart: asDay(quarterStart),
      periodEnd: asDay(quarterEnd),
      ownerUserId: userId("amina.benali@brandshift.test"),
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      title: "Make the studio predictable to work with",
      description: "Deadlines that hold, and a client who is never surprised.",
      periodStart: asDay(quarterStart),
      periodEnd: asDay(quarterEnd),
      ownerUserId: userId("elena.rossi@brandshift.test"),
      departmentId: departmentId("engineering"),
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      title: "Grow the film side into a standalone offer",
      description: "It sells as an add-on today. It should sell on its own.",
      periodStart: asDay(quarterStart),
      periodEnd: asDay(quarterEnd),
      ownerUserId: userId("sofia.laurent@brandshift.test"),
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
  ]);

  const keyResultRows = await scope.insert(keyResults, [
    // On track: measured, and roughly keeping up with the calendar.
    {
      objectiveId: objectiveRows[0].id,
      title: "Retainer revenue per month",
      unit: "currency" as const,
      direction: "increase" as const,
      startValue: 12_000_00,
      targetValue: 30_000_00,
      position: 0,
    },
    {
      objectiveId: objectiveRows[0].id,
      title: "Clients on a retainer",
      unit: "count" as const,
      direction: "increase" as const,
      startValue: 2,
      targetValue: 5,
      position: 1,
    },
    // Slipped: a number that should fall and has barely moved.
    {
      objectiveId: objectiveRows[1].id,
      title: "Deadlines missed per month",
      unit: "count" as const,
      direction: "decrease" as const,
      startValue: 9,
      targetValue: 2,
      position: 0,
    },
    {
      objectiveId: objectiveRows[1].id,
      title: "Projects delivered on the promised date",
      unit: "percent" as const,
      direction: "increase" as const,
      startValue: 6_000,
      targetValue: 9_000,
      position: 1,
    },
    // Never measured: no checkpoints at all, on purpose.
    {
      objectiveId: objectiveRows[2].id,
      title: "Film projects sold without a design package",
      unit: "count" as const,
      direction: "increase" as const,
      startValue: 0,
      targetValue: 6,
      position: 0,
    },
  ]);

  const checkpointRows = await scope.insert(keyResultCheckpoints, [
    {
      keyResultId: keyResultRows[0].id,
      value: 18_500_00,
      recordedOn: day(-14),
      note: "Kestrel signed for six months.",
      recordedByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      keyResultId: keyResultRows[0].id,
      value: 21_000_00,
      recordedOn: day(-3),
      recordedByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      keyResultId: keyResultRows[1].id,
      value: 3,
      recordedOn: day(-3),
      recordedByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      keyResultId: keyResultRows[2].id,
      value: 8,
      recordedOn: day(-7),
      note: "Two slipped in the same week; both were waiting on client copy.",
      recordedByUserId: userId("elena.rossi@brandshift.test"),
    },
    {
      keyResultId: keyResultRows[3].id,
      value: 6_500,
      recordedOn: day(-7),
      recordedByUserId: userId("elena.rossi@brandshift.test"),
    },
  ]);

  console.log(
    `Created ${objectiveRows.length} objectives, ${keyResultRows.length} key results, ${checkpointRows.length} checkpoints`,
  );

  // -------------------------------------------------------------------------
  // Procedures
  // -------------------------------------------------------------------------

  /**
   * Four procedures in four review states, on purpose: current, due soon,
   * badly overdue, and never reviewed.
   *
   * The last two are the ones worth seeding. A library where everything is
   * green proves nothing about the screen, and "overdue" and "never checked"
   * are the two states the whole feature exists to surface -- they need to be
   * visible in development or nobody ever looks at how they render.
   */
  const sopRows = await scope.insert(sops, [
    {
      slug: "delivering-a-film-project",
      title: "Delivering a film project",
      summary: "From the moment a film job is signed to the day the final cut is handed over.",
      status: "published" as const,
      departmentId: departmentId("design"),
      ownerUserId: userId("yusuf.karim@brandshift.test"),
      reviewIntervalDays: 180,
      lastReviewedOn: day(-20),
      lastReviewedByUserId: userId("yusuf.karim@brandshift.test"),
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
    {
      slug: "onboarding-a-new-client",
      title: "Onboarding a new client",
      summary: "What happens between a signed quote and the first working session.",
      status: "published" as const,
      departmentId: departmentId("client-services"),
      ownerUserId: userId("sofia.laurent@brandshift.test"),
      reviewIntervalDays: 180,
      // Due in about a fortnight.
      lastReviewedOn: day(-166),
      lastReviewedByUserId: userId("sofia.laurent@brandshift.test"),
      createdByUserId: userId("sofia.laurent@brandshift.test"),
    },
    {
      slug: "handing-over-a-website",
      title: "Handing over a website",
      summary: "Access, backups, and who to call when it breaks at the weekend.",
      status: "published" as const,
      departmentId: departmentId("engineering"),
      ownerUserId: userId("elena.rossi@brandshift.test"),
      reviewIntervalDays: 180,
      // Nearly a year past its review: the worst case in the library.
      lastReviewedOn: day(-340),
      lastReviewedByUserId: userId("elena.rossi@brandshift.test"),
      createdByUserId: userId("elena.rossi@brandshift.test"),
    },
    {
      slug: "answering-an-rfp",
      title: "Answering an RFP",
      summary: "Written after the last one and never checked since.",
      status: "draft" as const,
      ownerUserId: userId("claire.moreau@brandshift.test"),
      reviewIntervalDays: 365,
      lastReviewedOn: null,
      createdByUserId: userId("claire.moreau@brandshift.test"),
    },
  ]);

  /** A procedure's steps, numbered by their order in the list. */
  const stepsFor = (sopId: string, rows: Array<[string, string | null]>) =>
    rows.map(([title, detail], index) => ({ sopId, position: index, title, detail }));

  const sopStepRows = await scope.insert(sopSteps, [
    ...stepsFor(sopRows[0].id, [
      [
        "Confirm the shoot dates with the client in writing",
        "Email, not a call. The date is the thing everything else hangs off.",
      ],
      ["Book the crew and the kit", null],
      ["Send the call sheet 48 hours before", "Everybody on it, including the client contact."],
      [
        "Back up the cards twice before leaving the location",
        "One copy stays with a different person.",
      ],
      ["Deliver the first cut for review", null],
      [
        "Hand over the masters and archive the project",
        "Archive goes to the studio drive, not to somebody's laptop.",
      ],
    ]),
    ...stepsFor(sopRows[1].id, [
      ["Create the company and the deal in the pipeline", null],
      [
        "Set up the project and its channel",
        "Use the quote to create the project so the deliverables come across.",
      ],
      [
        "Introduce the team by name in the channel",
        "A client who knows who is doing the work chases less.",
      ],
      ["Book the kickoff", null],
    ]),
    ...stepsFor(sopRows[2].id, [
      ["Transfer the domain and the hosting to the client's account", null],
      ["Hand over credentials through a password manager, never by email", null],
      ["Confirm backups are running and say where they go", null],
      [
        "Agree in writing who is called out of hours, and what for",
        "This is the step that gets skipped and the one that causes the argument.",
      ],
    ]),
    ...stepsFor(sopRows[3].id, [
      ["Decide whether to answer it at all", "Most are not worth the days they cost."],
      ["Pull the three closest case studies", null],
      ["Write the answer, then cut it by a third", null],
    ]),
  ]);

  console.log(`Created ${sopRows.length} procedures, ${sopStepRows.length} steps`);

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  /**
   * Two templates, one with a schedule and one without.
   *
   * The second is the interesting case: a template whose tasks carry no
   * offsets, which is what a procedure turns into. It proves the screen and
   * the arithmetic both cope with "no deadline" as a real answer rather than
   * treating it as day zero.
   */
  const templateRows = await scope.insert(projectTemplates, [
    {
      slug: "film-project",
      name: "Film project",
      description: "Shoot, cut and deliver. Six weeks from kickoff if nothing slips.",
      departmentId: departmentId("design"),
      createdByUserId: userId("yusuf.karim@brandshift.test"),
    },
    {
      slug: "website-handover",
      name: "Website handover",
      description: "Everything that has to happen before a site stops being ours.",
      departmentId: departmentId("engineering"),
      createdByUserId: userId("elena.rossi@brandshift.test"),
    },
  ]);

  /** Title, priority, and the day of the project it is due -- null for none. */
  const templateTasksFor = (
    templateId: string,
    rows: Array<[string, "low" | "medium" | "high" | "urgent", number | null]>,
  ) =>
    rows.map(([title, priority, offsetDays], index) => ({
      templateId,
      position: index,
      title,
      description: null,
      priority,
      offsetDays,
    }));

  const templateTaskRows = await scope.insert(templateTasks, [
    ...templateTasksFor(templateRows[0].id, [
      ["Kickoff with the client", "high", 0],
      ["Lock the treatment", "high", 5],
      ["Book crew and kit", "urgent", 7],
      ["Shoot", "urgent", 14],
      ["First cut for review", "high", 28],
      ["Deliver masters and archive", "medium", 42],
    ]),
    // No offsets at all: this is the shape a procedure becomes.
    ...templateTasksFor(templateRows[1].id, [
      ["Transfer domain and hosting", "high", null],
      ["Hand over credentials through a password manager", "urgent", null],
      ["Confirm backups are running", "high", null],
      ["Agree out-of-hours cover in writing", "medium", null],
    ]),
  ]);

  console.log(
    `Created ${templateRows.length} templates, ${templateTaskRows.length} template tasks`,
  );

  // -------------------------------------------------------------------------
  // Weekly reviews
  // -------------------------------------------------------------------------

  /**
   * Three weeks, with a deliberate hole in the middle.
   *
   * The gap is the point. A reviews screen that only ever shows the weeks you
   * did write up is a diary; the value is the week you skipped, and it needs
   * to be visible in development or nobody ever looks at how it renders.
   *
   * One is left as a draft, so both states are on screen: live figures and an
   * editor, next to a frozen record.
   */
  const mondayOf = (offsetDays: number) => {
    const at = new Date(`${addDays(todayInOrg, offsetDays)}T00:00:00Z`);
    // Monday is 1; Sunday is 0 and belongs to the week that just ended.
    const shift = (at.getUTCDay() + 6) % 7;
    return addDays(at.toISOString().slice(0, 10), -shift);
  };

  const reviewRows = await scope.insert(weeklyReviews, [
    {
      weekStart: mondayOf(-28),
      heldOn: addDays(mondayOf(-28), 7),
      facilitatorUserId: userId("amina.benali@brandshift.test"),
      highlights: "Northwind went live a week early, and the client said so in writing.",
      concerns: "Two projects slipped waiting on client copy. It is the third time this quarter.",
      snapshot: {
        completed: 11,
        created: 9,
        projectsAtRisk: 2,
        blocked: 3,
        objectivesOpen: 3,
        objectivesBehind: 1,
        objectivesNotMeasured: 1,
        proceduresOverdue: 2,
        peopleAway: 1,
      },
      publishedAt: new Date(),
      publishedByUserId: userId("amina.benali@brandshift.test"),
      createdByUserId: userId("amina.benali@brandshift.test"),
    },
    // The week of -21 is deliberately missing.
    {
      weekStart: mondayOf(-14),
      heldOn: addDays(mondayOf(-14), 8),
      facilitatorUserId: userId("elena.rossi@brandshift.test"),
      highlights: "The handover procedure got used for the first time and held up.",
      concerns: "Nobody has measured the film objective since it was written.",
      snapshot: {
        completed: 8,
        created: 12,
        projectsAtRisk: 3,
        blocked: 2,
        objectivesOpen: 3,
        objectivesBehind: 1,
        objectivesNotMeasured: 1,
        proceduresOverdue: 2,
        peopleAway: 2,
      },
      publishedAt: new Date(),
      publishedByUserId: userId("elena.rossi@brandshift.test"),
      createdByUserId: userId("elena.rossi@brandshift.test"),
    },
    // Still a draft: live figures, and an editor on screen.
    {
      weekStart: mondayOf(-7),
      heldOn: todayInOrg,
      facilitatorUserId: userId("elena.rossi@brandshift.test"),
      createdByUserId: userId("elena.rossi@brandshift.test"),
    },
  ]);

  const decisionRows = await scope.insert(reviewDecisions, [
    {
      reviewId: reviewRows[0].id,
      position: 0,
      decision: "Stop starting a shoot before the copy is signed off",
      ownerUserId: userId("sofia.laurent@brandshift.test"),
      // Already past, so it shows up on the reviews screen as still open.
      dueDate: addDays(todayInOrg, -5),
    },
    {
      reviewId: reviewRows[0].id,
      position: 1,
      decision: "Write the client-onboarding procedure down properly",
      ownerUserId: userId("sofia.laurent@brandshift.test"),
      dueDate: addDays(todayInOrg, 20),
    },
    {
      reviewId: reviewRows[1].id,
      position: 0,
      decision: "Put a number against the film objective before the next review",
      ownerUserId: userId("sofia.laurent@brandshift.test"),
      dueDate: addDays(todayInOrg, -2),
    },
  ]);

  console.log(`Created ${reviewRows.length} weekly reviews, ${decisionRows.length} decisions`);

  await report(scope, insertedTasks);
}

/**
 * Where a task sits depends on the project it lives in and how far down the
 * list it is: early work is finished, the middle is moving, the tail has not
 * started. That is what makes the lists look like a real workload rather than a
 * random status shuffle.
 */
function planTask(
  project: (typeof PROJECTS)[number],
  progress: number,
  candidates: string[],
  index: number,
): {
  status: NewTask["status"];
  dueInDays: number | null;
  assigneeEmail: string | null;
} {
  const assignee = candidates[index % candidates.length]!;

  if (project.status === "completed") {
    return { status: "done", dueInDays: -randomInt(28, 60), assigneeEmail: assignee };
  }

  if (project.status === "planning") {
    // Nothing has started, and the first item is deliberately unassigned so the
    // admin coordination queue has an "unassigned" case to show.
    return {
      status: "todo",
      dueInDays: index === 0 ? null : randomInt(10, 70),
      assigneeEmail: index === 0 ? null : assignee,
    };
  }

  if (project.status === "on_hold") {
    return {
      status: index === 0 ? "blocked" : "todo",
      dueInDays: null,
      assigneeEmail: assignee,
    };
  }

  // Active projects.
  if (progress < 0.4) {
    return { status: "done", dueInDays: -randomInt(3, 30), assigneeEmail: assignee };
  }

  if (progress < 0.6) {
    // The overdue band: in flight and already past its date.
    return { status: "in_progress", dueInDays: -randomInt(1, 6), assigneeEmail: assignee };
  }

  if (progress < 0.75) {
    return { status: "blocked", dueInDays: randomInt(-4, 8), assigneeEmail: assignee };
  }

  if (progress < 0.85) {
    return { status: "in_progress", dueInDays: randomInt(1, 5), assigneeEmail: assignee };
  }

  // The tail: not started. Some are dropped, some are waiting for an owner,
  // some have no date yet -- each one is a state a screen has to handle.
  return {
    status: index % 3 === 0 ? "cancelled" : "todo",
    dueInDays: index % 5 === 0 ? null : randomInt(2, 40),
    assigneeEmail: index % 2 === 1 ? null : assignee,
  };
}

/** Task priority tracks its project's, easing off toward the tail of the list. */
function planPriority(
  projectPriority: (typeof PROJECTS)[number]["priority"],
  progress: number,
): NewTask["priority"] {
  if (projectPriority === "urgent" && progress > 0.5) return pick(["urgent", "high"] as const);
  if (projectPriority === "high") return pick(["high", "medium", "medium"] as const);
  if (projectPriority === "low") return pick(["low", "low", "medium"] as const);
  return pick(["medium", "medium", "high", "low"] as const);
}

/**
 * Print what actually landed. The spread is the point of this seed, so it is
 * asserted rather than hoped for: a change that quietly flattens the data into
 * sixty identical open tasks fails here instead of on screen.
 */
async function report(
  scope: ReturnType<typeof withOrg>,
  rows: Array<{
    status: string;
    dueDate: string | null;
    assigneeUserId: string | null;
  }>,
) {
  const today = day(0);
  const counts = rows.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});

  const overdue = rows.filter(
    (task) =>
      task.dueDate !== null &&
      task.dueDate < today &&
      task.status !== "done" &&
      task.status !== "cancelled",
  ).length;
  const unassigned = rows.filter(
    (task) => task.assigneeUserId === null && task.status !== "done",
  ).length;
  const undated = rows.filter((task) => task.dueDate === null).length;

  console.log("\nTask spread");
  for (const [status, count] of Object.entries(counts).sort()) {
    console.log(`  ${status.padEnd(12)} ${count}`);
  }
  console.log(`  ${"overdue".padEnd(12)} ${overdue}`);
  console.log(`  ${"unassigned".padEnd(12)} ${unassigned}`);
  console.log(`  ${"no deadline".padEnd(12)} ${undated}`);

  const expectations: Array<[string, boolean]> = [
    ["at least 50 tasks", rows.length >= 50],
    ["some overdue work", overdue >= 4],
    ["some blocked work", (counts.blocked ?? 0) >= 3],
    ["some unassigned work", unassigned >= 2],
    ["some undated work", undated >= 4],
    [
      "every status present",
      ["todo", "in_progress", "blocked", "done", "cancelled"].every((s) => counts[s]),
    ],
  ];

  const failures = expectations.filter(([, ok]) => !ok).map(([label]) => label);
  if (failures.length > 0) {
    throw new Error(`Seed data is not realistic enough -- missing: ${failures.join(", ")}`);
  }

  console.log(`\nSeeded organization ${scope.organizationId}`);
  console.log(`Sign in as any address in src/db/seed-data.ts, password: ${DEMO_PASSWORD}`);
  console.log("  owner   amina.benali@brandshift.test");
  console.log("  admin   tom.decker@brandshift.test");
  console.log("  manager elena.rossi@brandshift.test");
  console.log("  member  lukas.weber@brandshift.test");
}

main()
  .then(closeDb)
  .catch(async (error) => {
    console.error("\nSeed failed:", error);
    await closeDb();
    process.exit(1);
  });
