import { relations } from "drizzle-orm";

import { activityEvents } from "./activity";
import { notifications } from "./notifications";
import { organizations } from "./organizations";
import { departments, memberships, users } from "./people";
import { projectMembers, projects } from "./projects";
import { sessions } from "./sessions";
import { tasks } from "./tasks";

/**
 * All relations in one place. Table modules stay free of cross-imports that
 * would form a cycle, and the shape of the graph is readable end to end.
 *
 * Declaring a relation does not relax tenancy: reads still go through
 * `withOrg()`, which scopes the root table of the query.
 */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  departments: many(departments),
  projects: many(projects),
  tasks: many(tasks),
  activityEvents: many(activityEvents),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  notifications: many(notifications),
  sessions: many(sessions),
  ownedProjects: many(projects),
  projectMemberships: many(projectMembers),
  assignedTasks: many(tasks),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [departments.organizationId],
    references: [organizations.id],
  }),
  lead: one(users, { fields: [departments.leadUserId], references: [users.id] }),
  members: many(memberships),
  projects: many(projects),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  department: one(departments, {
    fields: [memberships.departmentId],
    references: [departments.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [sessions.organizationId],
    references: [organizations.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  department: one(departments, {
    fields: [projects.departmentId],
    references: [departments.id],
  }),
  owner: one(users, { fields: [projects.ownerUserId], references: [users.id] }),
  members: many(projectMembers),
  tasks: many(tasks),
  activityEvents: many(activityEvents),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [projectMembers.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tasks.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(users, { fields: [tasks.assigneeUserId], references: [users.id] }),
  createdBy: one(users, { fields: [tasks.createdByUserId], references: [users.id] }),
  activityEvents: many(activityEvents),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  event: one(activityEvents, {
    fields: [notifications.activityEventId],
    references: [activityEvents.id],
  }),
}));

export const activityEventsRelations = relations(activityEvents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [activityEvents.organizationId],
    references: [organizations.id],
  }),
  actor: one(users, { fields: [activityEvents.actorUserId], references: [users.id] }),
  project: one(projects, { fields: [activityEvents.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [activityEvents.taskId], references: [tasks.id] }),
  notifications: many(notifications),
}));
