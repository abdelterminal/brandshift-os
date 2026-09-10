/**
 * The vocabulary of the app-wide live signal.
 *
 * A tenant write announces itself with one of these coarse topics -- one per
 * screen family, not one per table. The browser refetches through the same
 * server components a page load uses, so "something in `finance` moved" is all
 * the client needs to know; it never has to reconstruct *what* moved.
 *
 * This module carries no `server-only`: the topic type is shared with the
 * client so the stream's payload has a name on both ends.
 */

export const LIVE_TOPICS = [
  "tasks",
  "projects",
  "deliverables",
  "documents",
  "playbook",
  "meetings",
  "leave",
  "people",
  "crm",
  "finance",
  "objectives",
  "reviews",
  "sops",
  "templates",
  "channels",
  "notifications",
  "activity",
  /** The catch-all for a tenant table added later without its own entry below. */
  "data",
] as const;

export type LiveTopic = (typeof LIVE_TOPICS)[number];

/**
 * Which tenant table's writes belong to which topic, keyed by the table's
 * name in Postgres (`getTableName`).
 *
 * `src/lib/realtime/live-topics.test.ts` fails the build if a name in
 * `TENANT_TABLE_NAMES` is missing here, so a new tenant table is a deliberate
 * choice of topic rather than a silent fall-through to `data`.
 */
export const TABLE_TOPIC: Readonly<Record<string, LiveTopic>> = {
  tasks: "tasks",
  task_links: "tasks",
  projects: "projects",
  project_members: "projects",
  deliverables: "deliverables",
  documents: "documents",
  document_sections: "documents",
  stage_playbook: "playbook",
  project_stage_setup: "playbook",
  meetings: "meetings",
  meeting_attendees: "meetings",
  leave_requests: "leave",
  departments: "people",
  memberships: "people",
  companies: "crm",
  contacts: "crm",
  deals: "crm",
  quotes: "finance",
  quote_lines: "finance",
  invoices: "finance",
  invoice_lines: "finance",
  expenses: "finance",
  objectives: "objectives",
  key_results: "objectives",
  key_result_checkpoints: "objectives",
  weekly_reviews: "reviews",
  review_decisions: "reviews",
  sops: "sops",
  sop_steps: "sops",
  project_templates: "templates",
  template_tasks: "templates",
  channels: "channels",
  channel_members: "channels",
  messages: "channels",
  activity_events: "activity",
  notifications: "notifications",
  // The mail queue. Its writes are internal and low-volume, but a screen does
  // read it (the outbox), so it still earns a live refresh.
  outbox_messages: "notifications",
};

/** The topic for a table name, falling back to the catch-all. */
export function topicForTable(tableName: string): LiveTopic {
  return TABLE_TOPIC[tableName] ?? "data";
}
