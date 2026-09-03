import { MongoClient, type Document, type ObjectId } from "mongodb";

/**
 * Everything the old database has to say, read once.
 *
 * The source is `abdelterminal/brandshiftsaas` -- Django + MongoEngine over a
 * `mediast_db` Mongo. Its documents are pulled into plain objects here so that
 * nothing downstream has to know about BSON, and so the whole of the reading
 * happens in one place where it can be pointed at a copy.
 *
 * **Read only.** Nothing in this file writes, and the connection asks for a
 * secondary when the deployment has one. The old app is still the system of
 * record: a migration that modifies its source is not a migration, it is an
 * outage.
 */

const asId = (value: unknown): string | null => {
  if (!value) return null;
  const id = value as ObjectId;
  return typeof id.toHexString === "function" ? id.toHexString() : String(value);
};

const asDate = (value: unknown): Date | null =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;

const asText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export type SourceUser = {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  departmentId: string | null;
  createdAt: Date | null;
};

export type SourceDepartment = {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  /** Present in the source, and there is nowhere to put them -- see the report. */
  hasIcon: boolean;
  hasImage: boolean;
};

export type SourceTask = {
  id: string;
  title: string;
  description?: string;
  note?: string;
  status?: string;
  priority?: string;
  progress?: number;
  deadline: Date | null;
  assignedToId: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedById: string | null;
  completedAt: Date | null;
  rejectionReason?: string;
  isArchived: boolean;
};

export type SourceProject = {
  id: string;
  name: string;
  client?: string;
  description?: string;
  owner?: string;
  status?: string;
  priority?: string;
  budget?: string;
  duration?: string;
  tags: string[];
  employeeIds: string[];
  departmentId: string | null;
  startDate: Date | null;
  deadline: Date | null;
  tasks: SourceTask[];
};

export type SourceEvent = {
  id: string;
  eventType?: string;
  actorId: string | null;
  employeeId: string | null;
  projectId: string | null;
  taskId?: string;
  taskTitle?: string;
  description?: string;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
};

export type SourceData = {
  users: SourceUser[];
  departments: SourceDepartment[];
  projects: SourceProject[];
  events: SourceEvent[];
  /** Counted, not carried. The report says why for each. */
  notCarried: {
    sessions: number;
    attendance: number;
    lunch: number;
    meetings: number;
    messages: number;
  };
};

function readTask(raw: Document): SourceTask {
  return {
    id: asId(raw.id) ?? asId(raw._id) ?? "",
    title: asText(raw.title) ?? "Untitled",
    description: asText(raw.description),
    note: asText(raw.note),
    status: asText(raw.status),
    priority: asText(raw.priority),
    progress: typeof raw.progress === "number" ? raw.progress : undefined,
    deadline: asDate(raw.deadline),
    assignedToId: asId(raw.assigned_to),
    assignedAt: asDate(raw.assigned_at),
    startedAt: asDate(raw.started_at),
    completedById: asId(raw.completed_by),
    completedAt: asDate(raw.completed_at),
    rejectionReason: asText(raw.rejection_reason),
    isArchived: raw.is_archived === true,
  };
}

export async function readSource(uri: string, database: string): Promise<SourceData> {
  const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });

  try {
    await client.connect();
    const db = client.db(database);

    const [users, departments, projects, events] = await Promise.all([
      db.collection("user").find().toArray(),
      db.collection("department").find().toArray(),
      db.collection("project").find().toArray(),
      db.collection("activity_events").find().sort({ created_at: 1 }).toArray(),
    ]);

    const count = async (name: string) => {
      try {
        return await db.collection(name).countDocuments();
      } catch {
        return 0;
      }
    };

    const [sessions, attendance, lunch, meetings, messages] = await Promise.all([
      count("user_sessions"),
      count("attendance_records"),
      count("lunch_records"),
      count("meetings"),
      count("messages"),
    ]);

    return {
      users: users.map((raw) => ({
        id: asId(raw._id) ?? "",
        email: String(raw.email ?? "")
          .trim()
          .toLowerCase(),
        passwordHash: String(raw.password ?? ""),
        firstName: asText(raw.first_name),
        lastName: asText(raw.last_name),
        role: asText(raw.role),
        departmentId: asId(raw.department),
        createdAt: asDate(raw.created_at),
      })),

      departments: departments.map((raw) => ({
        id: asId(raw._id) ?? "",
        name: String(raw.name ?? "").trim(),
        subtitle: asText(raw.subtitle),
        description: asText(raw.description),
        hasIcon: Boolean(raw.icon),
        hasImage: Boolean(raw.image),
      })),

      projects: projects.map((raw) => ({
        id: asId(raw._id) ?? "",
        name: String(raw.name ?? "").trim(),
        client: asText(raw.client),
        description: asText(raw.description),
        owner: asText(raw.owner),
        status: asText(raw.status),
        priority: asText(raw.priority),
        budget: asText(raw.budget),
        duration: asText(raw.duration),
        tags: Array.isArray(raw.tags)
          ? raw.tags.filter((t): t is string => typeof t === "string")
          : [],
        employeeIds: Array.isArray(raw.employees)
          ? raw.employees.map(asId).filter((id): id is string => Boolean(id))
          : [],
        departmentId: asId(raw.department),
        startDate: asDate(raw.start_date),
        deadline: asDate(raw.deadline),
        tasks: Array.isArray(raw.tasks) ? raw.tasks.map(readTask) : [],
      })),

      events: events.map((raw) => ({
        id: asId(raw._id) ?? "",
        eventType: asText(raw.event_type),
        actorId: asId(raw.actor),
        employeeId: asId(raw.employee),
        projectId: asId(raw.project),
        taskId: asText(raw.task_id),
        taskTitle: asText(raw.task_title),
        description: asText(raw.description),
        metadata:
          raw.metadata && typeof raw.metadata === "object"
            ? (raw.metadata as Record<string, unknown>)
            : {},
        createdAt: asDate(raw.created_at),
      })),

      notCarried: { sessions, attendance, lunch, meetings, messages },
    };
  } finally {
    await client.close();
  }
}
