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
  GENERAL_CHANNEL,
  LEAVE,
  MEETINGS,
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
  departments,
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
  type NewTask,
} from "./schema";
import { withOrg } from "./tenancy";
import { hashPassword } from "@/lib/password";
import { addDays, instantFromLocal } from "@/lib/calendar-dates";
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
