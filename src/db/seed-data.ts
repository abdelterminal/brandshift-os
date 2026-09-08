/**
 * The cast and catalogue the seed builds from. Kept apart from the insert logic
 * so the shape of the demo org is readable at a glance and easy to extend.
 *
 * Names, departments and project titles are those of a brand agency, because
 * screens designed against `Project 1 / Task 3` hide exactly the density
 * problems this app exists to solve.
 */

import type { ModulePermissions } from "./schema/people";

export const ORGANIZATION = {
  slug: "mediast",
  name: "Mediast",
  timezone: "Europe/Paris",
  defaultLocale: "fr" as const,
  // ISO 4217. The agency quotes and invoices in Moroccan dirhams.
  currency: "MAD",
  // The letterhead, taken from the devis that goes out to clients rather than
  // invented. The slug changed with the name: it is only ever seen in seeded
  // data, so there is nothing to migrate behind it.
  tagline: "Agence de Communication & Marketing Digital",
  city: "Meknès, Maroc",
  website: "mediast.ma",
  contactEmail: "contact@mediast.ma",
};

export const DEPARTMENTS = [
  { slug: "strategy", name: "Brand Strategy" },
  { slug: "design", name: "Design" },
  { slug: "engineering", name: "Engineering" },
  { slug: "client-services", name: "Client Services" },
] as const;

export type DepartmentSlug = (typeof DEPARTMENTS)[number]["slug"];

export type SeedUser = {
  email: string;
  name: string;
  role: "owner" | "admin" | "manager" | "member";
  department: DepartmentSlug;
  jobTitle: string;
  locale: "en" | "fr";
  permissions: ModulePermissions;
  /** Department lead. Exactly one per department. */
  leads?: boolean;
};

/**
 * Twelve people: one owner, one admin, four managers (one per department) and
 * six members. Every role and every department is represented, so permission
 * work always has a real subject to test against.
 */
export const USERS: SeedUser[] = [
  {
    email: "amina.benali@brandshift.test",
    name: "Amina Benali",
    role: "owner",
    department: "strategy",
    jobTitle: "Founder & Managing Director",
    locale: "fr",
    permissions: { finance: true, people: true, crm: true, insights: true },
  },
  {
    email: "tom.decker@brandshift.test",
    name: "Tom Decker",
    role: "admin",
    department: "client-services",
    jobTitle: "Operations Lead",
    locale: "en",
    permissions: { finance: true, people: true, crm: true, insights: true },
  },
  {
    email: "claire.moreau@brandshift.test",
    name: "Claire Moreau",
    role: "manager",
    department: "strategy",
    jobTitle: "Head of Strategy",
    locale: "fr",
    permissions: { insights: true, crm: true },
    leads: true,
  },
  {
    email: "yusuf.karim@brandshift.test",
    name: "Yusuf Karim",
    role: "manager",
    department: "design",
    jobTitle: "Design Director",
    locale: "en",
    permissions: { insights: true },
    leads: true,
  },
  {
    email: "elena.rossi@brandshift.test",
    name: "Elena Rossi",
    role: "manager",
    department: "engineering",
    jobTitle: "Engineering Manager",
    locale: "en",
    permissions: { insights: true },
    leads: true,
  },
  {
    email: "sofia.laurent@brandshift.test",
    name: "Sofia Laurent",
    role: "manager",
    department: "client-services",
    jobTitle: "Client Services Manager",
    locale: "fr",
    permissions: { crm: true, insights: true },
    leads: true,
  },
  {
    email: "nadia.haddad@brandshift.test",
    name: "Nadia Haddad",
    role: "member",
    department: "strategy",
    jobTitle: "Brand Strategist",
    locale: "fr",
    permissions: {},
  },
  {
    email: "marc.dubois@brandshift.test",
    name: "Marc Dubois",
    role: "member",
    department: "design",
    jobTitle: "Senior Designer",
    locale: "fr",
    permissions: {},
  },
  {
    email: "priya.raman@brandshift.test",
    name: "Priya Raman",
    role: "member",
    department: "design",
    jobTitle: "Motion Designer",
    locale: "en",
    permissions: {},
  },
  {
    email: "lukas.weber@brandshift.test",
    name: "Lukas Weber",
    role: "member",
    department: "engineering",
    jobTitle: "Frontend Engineer",
    locale: "en",
    permissions: {},
  },
  {
    email: "ines.ferreira@brandshift.test",
    name: "Inès Ferreira",
    role: "member",
    department: "engineering",
    jobTitle: "Backend Engineer",
    locale: "fr",
    permissions: {},
  },
  {
    email: "oscar.lindqvist@brandshift.test",
    name: "Oscar Lindqvist",
    role: "member",
    department: "client-services",
    jobTitle: "Account Executive",
    locale: "en",
    permissions: { crm: true },
  },
];

export type SeedProject = {
  key: string;
  name: string;
  description: string;
  department: DepartmentSlug;
  status: "planning" | "active" | "on_hold" | "completed" | "archived";
  priority: "low" | "medium" | "high" | "urgent";
  /** Days from today. Negative is in the past. */
  startsInDays: number;
  dueInDays: number | null;
  ownerEmail: string;
  memberEmails: string[];
};

/**
 * Eight projects spanning every status, including one already completed and one
 * on hold, so list filters and empty states have something honest to render.
 */
export const PROJECTS: SeedProject[] = [
  {
    key: "MER",
    name: "Meridian rebrand",
    description:
      "Full identity rebuild for Meridian Bank: positioning, visual identity, and a rollout kit for 40 branches.",
    department: "strategy",
    status: "active",
    priority: "urgent",
    startsInDays: -48,
    dueInDays: 21,
    ownerEmail: "claire.moreau@brandshift.test",
    memberEmails: [
      "nadia.haddad@brandshift.test",
      "yusuf.karim@brandshift.test",
      "marc.dubois@brandshift.test",
      "sofia.laurent@brandshift.test",
    ],
  },
  {
    key: "ATL",
    name: "Atlas design system",
    description:
      "The component library and token set behind every Mediast client build. Ships in light and dark.",
    department: "design",
    status: "active",
    priority: "high",
    startsInDays: -90,
    dueInDays: 45,
    ownerEmail: "yusuf.karim@brandshift.test",
    memberEmails: [
      "marc.dubois@brandshift.test",
      "priya.raman@brandshift.test",
      "lukas.weber@brandshift.test",
    ],
  },
  {
    key: "NOR",
    name: "Northwind e-commerce replatform",
    description:
      "Move Northwind off their legacy storefront: catalogue migration, checkout rebuild, and a six-week hypercare window.",
    department: "engineering",
    status: "active",
    priority: "high",
    startsInDays: -35,
    dueInDays: 9,
    ownerEmail: "elena.rossi@brandshift.test",
    memberEmails: [
      "lukas.weber@brandshift.test",
      "ines.ferreira@brandshift.test",
      "priya.raman@brandshift.test",
    ],
  },
  {
    key: "LUM",
    name: "Lumen campaign launch",
    description:
      "Q4 launch campaign for Lumen: film, social cutdowns, and paid assets in five markets.",
    department: "design",
    status: "active",
    priority: "medium",
    startsInDays: -14,
    dueInDays: 33,
    ownerEmail: "priya.raman@brandshift.test",
    memberEmails: ["marc.dubois@brandshift.test", "nadia.haddad@brandshift.test"],
  },
  {
    key: "HAR",
    name: "Harbour onboarding revamp",
    description:
      "Rework Harbour's first-run experience after the usability audit. Scope is the first ten minutes, nothing else.",
    department: "engineering",
    status: "planning",
    priority: "medium",
    startsInDays: 7,
    dueInDays: 74,
    ownerEmail: "elena.rossi@brandshift.test",
    memberEmails: ["ines.ferreira@brandshift.test", "yusuf.karim@brandshift.test"],
  },
  {
    key: "VER",
    name: "Verdant packaging refresh",
    description:
      "Packaging line refresh for Verdant's 2027 range. Paused pending their supplier decision.",
    department: "design",
    status: "on_hold",
    priority: "low",
    startsInDays: -60,
    dueInDays: null,
    ownerEmail: "marc.dubois@brandshift.test",
    memberEmails: ["yusuf.karim@brandshift.test"],
  },
  {
    key: "KES",
    name: "Kestrel annual report",
    description:
      "Editorial design and production for Kestrel's annual report. Delivered and signed off.",
    department: "strategy",
    status: "completed",
    priority: "medium",
    startsInDays: -140,
    dueInDays: -26,
    ownerEmail: "nadia.haddad@brandshift.test",
    memberEmails: ["claire.moreau@brandshift.test", "marc.dubois@brandshift.test"],
  },
  {
    key: "ORB",
    name: "Orbit retainer, Q4",
    description: "Rolling design and content retainer for Orbit. Scoped monthly, invoiced monthly.",
    department: "client-services",
    status: "active",
    priority: "medium",
    startsInDays: -21,
    dueInDays: 60,
    ownerEmail: "sofia.laurent@brandshift.test",
    memberEmails: [
      "oscar.lindqvist@brandshift.test",
      "priya.raman@brandshift.test",
      "nadia.haddad@brandshift.test",
    ],
  },
];

/**
 * Task titles per project. The seed walks these in order and spreads status,
 * priority, assignee and due date across them, so the mix stays realistic
 * without every project reading like the same checklist.
 */
export const TASK_TITLES: Record<string, string[]> = {
  MER: [
    "Stakeholder interviews with the Meridian board",
    "Competitive audit across 12 retail banks",
    "Positioning territories, first round",
    "Naming architecture for sub-brands",
    "Logo refinement, second pass",
    "Colour and type system for the new identity",
    "Branch signage specification",
    "Rollout kit for 40 branches",
    "Legal review of the trademark shortlist",
    "Board presentation deck",
  ],
  ATL: [
    "Token set: colour ramps for light and dark",
    "Type scale and 14px body floor",
    "Button primitive with all interaction states",
    "Table primitive with server-side pagination",
    "Drawer and dialog primitives",
    "Empty, loading and error state patterns",
    "Contrast audit against WCAG AA",
    "Component documentation site",
    "Migrate Lumen assets onto Atlas",
  ],
  NOR: [
    "Catalogue export from the legacy storefront",
    "Product data mapping and cleanup",
    "Checkout rebuild, payment step",
    "Checkout rebuild, address validation",
    "Order history migration",
    "Search relevance tuning",
    "Load test at 4x expected peak",
    "Hypercare runbook and on-call rota",
    "Cutover rehearsal with Northwind ops",
    "Accessibility pass on the checkout flow",
  ],
  LUM: [
    "Creative territories for the Q4 film",
    "Storyboard and shot list",
    "Location scout and permits",
    "Social cutdowns, nine by sixteen",
    "Paid asset resize matrix, five markets",
    "Subtitle and voiceover localisation",
    "Media plan sign-off with Lumen",
  ],
  HAR: [
    "Read the usability audit and pull the top ten findings",
    "Map the current first-run flow end to end",
    "Define the first ten minutes we are actually fixing",
    "Wireframe the new welcome sequence",
    "Estimate the engineering work",
  ],
  VER: [
    "Material samples from the supplier shortlist",
    "Structural mockups for the 2027 range",
    "Print trial with the new stock",
  ],
  KES: [
    "Editorial plan and section running order",
    "Data visualisation for the financial section",
    "Photography direction and shoot",
    "Layout, first full pass",
    "Proofread and fact-check",
    "Print production and delivery",
  ],
  ORB: [
    "October scope call with Orbit",
    "Social templates for the October push",
    "Blog illustration set",
    "November scope call with Orbit",
    "Quarterly performance readout",
    "Retainer renewal proposal",
  ],
};

/** Standalone to-dos with no project, so the personal list has real content. */
export const PERSONAL_TASKS: Array<{ title: string; assigneeEmail: string }> = [
  {
    title: "Book the Q4 all-hands room",
    assigneeEmail: "tom.decker@brandshift.test",
  },
  {
    title: "Review the new starter handbook",
    assigneeEmail: "tom.decker@brandshift.test",
  },
  {
    title: "Renew the font licences",
    assigneeEmail: "yusuf.karim@brandshift.test",
  },
  {
    title: "Follow up on the Verdant supplier decision",
    assigneeEmail: "sofia.laurent@brandshift.test",
  },
];

/** Reasons attached to blocked tasks. Real blockers name who or what is missing. */
export const BLOCKER_REASONS = [
  "Waiting on final copy from the client.",
  "Blocked by the legal review; nothing to do until it clears.",
  "Staging environment is down, cannot verify the fix.",
  "Needs the supplier quote before we can size the work.",
  "Waiting for brand sign-off on the colour change.",
];

/**
 * What people said, per project channel.
 *
 * Written as real exchanges rather than filler, because a channel full of
 * "Message 1 / Message 2" tells you nothing about whether the screen works.
 * These are the conversations that go with the tasks seeded above -- a blocker
 * being chased, a decision being made -- so the interleaved feed reads as one
 * story rather than two lists that happen to share a page.
 *
 * `minutesAgo` counts back from the seed run, so the newest lines are recent
 * enough to be genuinely unread.
 */
export type SeedMessage = {
  authorEmail: string;
  body: string;
  minutesAgo: number;
};

export const CHANNEL_MESSAGES: Record<string, SeedMessage[]> = {
  MER: [
    {
      authorEmail: "claire.moreau@brandshift.test",
      body: "Meridian have moved the board presentation forward a week. Everything in the rollout kit now needs to be signed off by the 14th.",
      minutesAgo: 4320,
    },
    {
      authorEmail: "nadia.haddad@brandshift.test",
      body: "That is tight but doable. The branch signage spec is the long pole -- I need the final wordmark locked before I can size anything.",
      minutesAgo: 4180,
    },
    {
      authorEmail: "yusuf.karim@brandshift.test",
      body: "Wordmark is locked as of this morning. Uploaded to the shared drive, same folder as the last round.",
      minutesAgo: 2900,
    },
    {
      authorEmail: "sofia.laurent@brandshift.test",
      body: "I have told the client we are holding to the 14th. They asked whether the 40-branch rollout still lands in the same quarter -- I said yes, flag it here if that changes.",
      minutesAgo: 240,
    },
    {
      authorEmail: "marc.dubois@brandshift.test",
      body: "One thing worth deciding here rather than in a call: are we producing the window vinyls in two sizes or three? Three covers every branch, two covers 36 of 40 and saves about a fortnight.",
      minutesAgo: 55,
    },
  ],
  ATL: [
    {
      authorEmail: "yusuf.karim@brandshift.test",
      body: "Dark mode contrast pass is done. Two of the muted greys were below AA on hover, both fixed at the token level rather than per component.",
      minutesAgo: 5600,
    },
    {
      authorEmail: "priya.raman@brandshift.test",
      body: "Good catch. Can we get a test that fails the build for that, rather than someone noticing it again in six months?",
      minutesAgo: 5400,
    },
    {
      authorEmail: "yusuf.karim@brandshift.test",
      body: "Already in. It generates every text-on-surface pair rather than a hand-picked list, which is how the hover states got missed the first time.",
      minutesAgo: 5280,
    },
    {
      authorEmail: "lukas.weber@brandshift.test",
      body: "Pulling the new tokens into Northwind today. Will shout if anything moves unexpectedly.",
      minutesAgo: 180,
    },
  ],
  NOR: [
    {
      authorEmail: "elena.rossi@brandshift.test",
      body: "Nine days to go. I want the catalogue migration finished by Friday so hypercare starts on a stable base rather than during the fix.",
      minutesAgo: 2880,
    },
    {
      authorEmail: "ines.ferreira@brandshift.test",
      body: "Catalogue is at about 80%. The remainder is all products with variant pricing, which the old exporter never handled properly.",
      minutesAgo: 2760,
    },
    {
      authorEmail: "lukas.weber@brandshift.test",
      body: "Staging has been down since this morning, so I cannot verify the checkout fix. Raised it with their infra team, no reply yet.",
      minutesAgo: 420,
    },
    {
      authorEmail: "elena.rossi@brandshift.test",
      body: "I will chase Northwind directly. If it is not back by tomorrow we move hypercare rather than pretending we tested it.",
      minutesAgo: 90,
    },
  ],
  LUM: [
    {
      authorEmail: "sofia.laurent@brandshift.test",
      body: "Five markets confirmed. The German cutdowns need different legal copy at the end -- Inès has the wording.",
      minutesAgo: 1500,
    },
    {
      authorEmail: "marc.dubois@brandshift.test",
      body: "Noted. Everything else is one master edit with market-specific end cards, so that is a small change rather than a separate grade.",
      minutesAgo: 1440,
    },
  ],
};

/**
 * The one channel that is not about a project.
 *
 * Every organization has a room like this, and having one in the seed is what
 * proves a channel with no subject renders properly -- no project header, no
 * activity interleaved, just what people said.
 */
export const GENERAL_CHANNEL = {
  name: "General",
  slug: "general",
  description: "Everything that does not belong to one project.",
  messages: [
    {
      authorEmail: "amina.benali@brandshift.test",
      body: "Reminder that the studio is closed on Monday. Anything due that day, move it to Tuesday now rather than on the morning.",
      minutesAgo: 3000,
    },
    {
      authorEmail: "tom.decker@brandshift.test",
      body: "The Q4 all-hands is booked for the 22nd, 3pm, main room. Dial-in details will go out nearer the time.",
      minutesAgo: 1200,
    },
    {
      authorEmail: "oscar.lindqvist@brandshift.test",
      body: "New starter handbook is ready for review. It is short on purpose -- if you find yourself scrolling, tell me what to cut.",
      minutesAgo: 300,
    },
  ] satisfies SeedMessage[],
};

/**
 * Meetings.
 *
 * Spread either side of today so the calendar has a past to show notes for and
 * a future to answer invitations to, and so "this week" is never empty on a
 * fresh database. Times are the organization's clock; the seed converts.
 *
 * One is already cancelled and one already has notes, because a calendar where
 * every meeting looks the same never exercises the two states that are easiest
 * to get wrong.
 */
export type SeedMeeting = {
  title: string;
  agenda: string | null;
  /** Days from today. Negative is in the past. */
  inDays: number;
  /** `HH:mm` in the organization's timezone. */
  at: string;
  minutes: number;
  location: string | null;
  projectKey: string | null;
  organizerEmail: string;
  attendeeEmails: string[];
  notes?: string;
  cancelled?: boolean;
};

export const MEETINGS: SeedMeeting[] = [
  {
    title: "Northwind launch readiness",
    agenda:
      "Catalogue migration status, the staging outage, and whether hypercare still starts on the 12th.",
    inDays: 0,
    at: "10:00",
    minutes: 45,
    location: "Studio room 2",
    projectKey: "NOR",
    organizerEmail: "elena.rossi@brandshift.test",
    attendeeEmails: [
      "lukas.weber@brandshift.test",
      "ines.ferreira@brandshift.test",
      "priya.raman@brandshift.test",
    ],
  },
  {
    title: "Meridian board walkthrough",
    agenda: "Dry run of the rollout kit before it goes to the client on the 14th.",
    inDays: 1,
    at: "14:30",
    minutes: 90,
    location: "https://meet.brandshift.test/meridian",
    projectKey: "MER",
    organizerEmail: "claire.moreau@brandshift.test",
    attendeeEmails: [
      "nadia.haddad@brandshift.test",
      "yusuf.karim@brandshift.test",
      "sofia.laurent@brandshift.test",
      "marc.dubois@brandshift.test",
    ],
  },
  {
    title: "Studio weekly",
    agenda: "What shipped, what is stuck, what is coming. Fifteen minutes, standing up.",
    inDays: 2,
    at: "09:15",
    minutes: 15,
    location: "Main room",
    projectKey: null,
    organizerEmail: "amina.benali@brandshift.test",
    attendeeEmails: [
      "tom.decker@brandshift.test",
      "claire.moreau@brandshift.test",
      "elena.rossi@brandshift.test",
      "yusuf.karim@brandshift.test",
      "sofia.laurent@brandshift.test",
    ],
  },
  {
    title: "Atlas token review",
    agenda: "The contrast pass, and whether the new ramps break anything downstream.",
    inDays: 3,
    at: "11:00",
    minutes: 60,
    location: "Studio room 1",
    projectKey: "ATL",
    organizerEmail: "yusuf.karim@brandshift.test",
    attendeeEmails: ["priya.raman@brandshift.test", "lukas.weber@brandshift.test"],
  },
  {
    title: "Lumen market kickoff",
    agenda: null,
    inDays: 4,
    at: "16:00",
    minutes: 60,
    location: null,
    projectKey: "LUM",
    organizerEmail: "sofia.laurent@brandshift.test",
    attendeeEmails: ["marc.dubois@brandshift.test", "ines.ferreira@brandshift.test"],
  },
  {
    title: "Northwind client check-in",
    agenda: "Weekly with the client. Rescheduled twice already.",
    inDays: 1,
    at: "17:00",
    minutes: 30,
    location: "https://meet.brandshift.test/northwind",
    projectKey: "NOR",
    organizerEmail: "elena.rossi@brandshift.test",
    attendeeEmails: ["sofia.laurent@brandshift.test", "lukas.weber@brandshift.test"],
    cancelled: true,
  },
  {
    title: "Meridian identity sign-off",
    agenda: "Final look at the wordmark before it goes into the rollout kit.",
    inDays: -4,
    at: "10:30",
    minutes: 60,
    location: "Studio room 1",
    projectKey: "MER",
    organizerEmail: "claire.moreau@brandshift.test",
    attendeeEmails: ["yusuf.karim@brandshift.test", "nadia.haddad@brandshift.test"],
    notes:
      "Wordmark approved as drawn, no further rounds. Yusuf to upload the locked files by Wednesday; Nadia can size the branch signage from Thursday. Client to be told the 14th still holds.",
  },
  {
    title: "Quarterly planning",
    agenda: "Capacity for Q4, and which of the three inbound briefs we take.",
    inDays: -9,
    at: "13:00",
    minutes: 120,
    location: "Main room",
    projectKey: null,
    organizerEmail: "amina.benali@brandshift.test",
    attendeeEmails: [
      "tom.decker@brandshift.test",
      "claire.moreau@brandshift.test",
      "elena.rossi@brandshift.test",
      "sofia.laurent@brandshift.test",
    ],
    notes:
      "Taking the Verdant packaging brief and the Kestrel report. Passing on the third: no design capacity before December without pushing Meridian, which we are not doing.",
  },
];

/**
 * Time off.
 *
 * Every status is represented, because a screen where each request looks the
 * same never exercises the states that are easiest to get wrong: a decision
 * with a reason attached, a withdrawal, a half day, and a request still
 * waiting for somebody. Two sit in the near future so the calendar has people
 * away on it, and one is in progress right now.
 */
export type SeedLeave = {
  email: string;
  type: "annual" | "sick" | "unpaid" | "parental" | "other";
  /** Days from today. Negative is in the past. */
  startsInDays: number;
  endsInDays: number;
  halfDay?: boolean;
  reason?: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  /** Who answered. Required for approved and declined. */
  decidedByEmail?: string;
  decisionNote?: string;
};

export const LEAVE: SeedLeave[] = [
  // Waiting on somebody, which is what the approval queue is for.
  {
    email: "lukas.weber@brandshift.test",
    type: "annual",
    startsInDays: 24,
    endsInDays: 33,
    reason: "Two weeks in Portugal, booked before the Northwind dates moved.",
    status: "pending",
  },
  {
    email: "priya.raman@brandshift.test",
    type: "annual",
    startsInDays: 11,
    endsInDays: 11,
    halfDay: true,
    reason: "Dentist, afternoon only.",
    status: "pending",
  },

  // Agreed, and therefore on the calendar.
  {
    email: "marc.dubois@brandshift.test",
    type: "annual",
    startsInDays: 3,
    endsInDays: 7,
    status: "approved",
    decidedByEmail: "sofia.laurent@brandshift.test",
  },
  {
    email: "nadia.haddad@brandshift.test",
    type: "annual",
    startsInDays: -1,
    endsInDays: 1,
    reason: "Long weekend.",
    status: "approved",
    decidedByEmail: "claire.moreau@brandshift.test",
  },
  {
    email: "ines.ferreira@brandshift.test",
    type: "sick",
    startsInDays: -6,
    endsInDays: -5,
    status: "approved",
    decidedByEmail: "elena.rossi@brandshift.test",
  },
  {
    email: "oscar.lindqvist@brandshift.test",
    type: "parental",
    startsInDays: 17,
    endsInDays: 31,
    status: "approved",
    decidedByEmail: "tom.decker@brandshift.test",
  },

  // Refused, with a reason. A no with no reason is one people ask about twice.
  {
    email: "yusuf.karim@brandshift.test",
    type: "annual",
    startsInDays: 8,
    endsInDays: 12,
    reason: "Skiing.",
    status: "declined",
    decidedByEmail: "amina.benali@brandshift.test",
    decisionNote: "That is the Meridian board week. Any other week in the month works.",
  },

  // Withdrawn by the person who asked.
  {
    email: "sofia.laurent@brandshift.test",
    type: "annual",
    startsInDays: -20,
    endsInDays: -18,
    status: "cancelled",
  },

  // Taken earlier in the year, so a balance is not a round number.
  {
    email: "elena.rossi@brandshift.test",
    type: "annual",
    startsInDays: -60,
    endsInDays: -54,
    status: "approved",
    decidedByEmail: "amina.benali@brandshift.test",
  },
  {
    email: "elena.rossi@brandshift.test",
    type: "annual",
    startsInDays: -25,
    endsInDays: -25,
    halfDay: true,
    status: "approved",
    decidedByEmail: "amina.benali@brandshift.test",
  },
];

/**
 * The pipeline.
 *
 * Every stage represented, including two lost with reasons on them, because a
 * pipeline where each deal looks the same never exercises the states that
 * matter: a deal past its close date, one already won, and one lost for a
 * reason somebody will want to read next quarter.
 *
 * Three of the companies are the clients behind seeded projects, so a won deal
 * and the work it became are visibly the same client.
 */
export type SeedCompany = {
  name: string;
  website: string | null;
  industry: string;
  status: "prospect" | "client" | "former";
  ownerEmail: string;
  notes?: string;
};

export const COMPANIES: SeedCompany[] = [
  {
    name: "Meridian Bank",
    website: "https://meridian.example",
    industry: "Financial services",
    status: "client",
    ownerEmail: "claire.moreau@brandshift.test",
    notes:
      "Board presentation moved forward a week; everything in the rollout kit signs off on the 14th. They are slow on legal and fast on everything else.",
  },
  {
    name: "Northwind Retail",
    website: "https://northwind.example",
    industry: "E-commerce",
    status: "client",
    ownerEmail: "elena.rossi@brandshift.test",
    notes: "Hypercare starts the day after cutover. Their infra team is one person.",
  },
  {
    name: "Lumen Energy",
    website: "https://lumen.example",
    industry: "Utilities",
    status: "client",
    ownerEmail: "sofia.laurent@brandshift.test",
  },
  {
    name: "Harbour Group",
    website: "https://harbour.example",
    industry: "Logistics",
    status: "client",
    ownerEmail: "tom.decker@brandshift.test",
  },
  {
    name: "Verdant Foods",
    website: "https://verdant.example",
    industry: "Food and drink",
    status: "prospect",
    ownerEmail: "sofia.laurent@brandshift.test",
    notes: "Packaging refresh is the way in. Procurement is the bottleneck, not marketing.",
  },
  {
    name: "Kestrel Partners",
    website: null,
    industry: "Professional services",
    status: "prospect",
    ownerEmail: "claire.moreau@brandshift.test",
  },
  {
    name: "Orbit Media",
    website: "https://orbit.example",
    industry: "Publishing",
    status: "former",
    ownerEmail: "amina.benali@brandshift.test",
    notes: "Retainer ended amicably in Q2. Worth a call when their new CMO settles in.",
  },
];

export type SeedContact = {
  name: string;
  companyName: string | null;
  email: string;
  phone: string | null;
  jobTitle: string;
};

export const CONTACTS: SeedContact[] = [
  {
    name: "Hélène Fabre",
    companyName: "Meridian Bank",
    email: "helene.fabre@meridian.example",
    phone: "+33 1 44 55 66 77",
    jobTitle: "Head of Brand",
  },
  {
    name: "Peter Voss",
    companyName: "Meridian Bank",
    email: "p.voss@meridian.example",
    phone: null,
    jobTitle: "Legal Counsel",
  },
  {
    name: "Aisha Rahman",
    companyName: "Northwind Retail",
    email: "aisha.rahman@northwind.example",
    phone: "+44 20 7946 0102",
    jobTitle: "Director of Digital",
  },
  {
    name: "Tomás Silva",
    companyName: "Northwind Retail",
    email: "tomas.silva@northwind.example",
    phone: null,
    jobTitle: "Infrastructure Lead",
  },
  {
    name: "Greta Lindholm",
    companyName: "Lumen Energy",
    email: "greta@lumen.example",
    phone: "+46 8 123 456",
    jobTitle: "Marketing Director",
  },
  {
    name: "Daniel Okonkwo",
    companyName: "Harbour Group",
    email: "d.okonkwo@harbour.example",
    phone: null,
    jobTitle: "Chief Operating Officer",
  },
  {
    name: "Juliette Renard",
    companyName: "Verdant Foods",
    email: "j.renard@verdant.example",
    phone: "+33 4 78 90 12 34",
    jobTitle: "Head of Packaging",
  },
  {
    name: "Martin Häkkinen",
    companyName: "Kestrel Partners",
    email: "martin.h@kestrel.example",
    phone: null,
    jobTitle: "Managing Partner",
  },
  {
    name: "Ruth Adeyemi",
    companyName: "Orbit Media",
    email: "ruth@orbit.example",
    phone: null,
    jobTitle: "Chief Marketing Officer",
  },
  {
    name: "Callum Reid",
    companyName: null,
    email: "callum.reid@example.test",
    phone: "+44 7700 900123",
    jobTitle: "Freelance Producer",
  },
];

export type SeedDeal = {
  title: string;
  companyName: string;
  contactName: string | null;
  stage: "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  /** In the organization's currency. Null means not priced yet. */
  value: number | null;
  /** Days from today. Negative is in the past. */
  closesInDays: number | null;
  ownerEmail: string;
  source: string | null;
  lostReason?: string;
};

export const DEALS: SeedDeal[] = [
  {
    title: "Packaging refresh, full range",
    companyName: "Verdant Foods",
    contactName: "Juliette Renard",
    stage: "negotiation",
    value: 78000,
    closesInDays: 12,
    ownerEmail: "sofia.laurent@brandshift.test",
    source: "Inbound enquiry",
  },
  {
    title: "Annual report and investor deck",
    companyName: "Kestrel Partners",
    contactName: "Martin Häkkinen",
    stage: "proposal",
    value: 42000,
    closesInDays: 21,
    ownerEmail: "claire.moreau@brandshift.test",
    source: "Referral from Meridian",
  },
  {
    title: "Meridian phase two: internal brand",
    companyName: "Meridian Bank",
    contactName: "Hélène Fabre",
    stage: "qualified",
    value: 95000,
    closesInDays: 45,
    ownerEmail: "claire.moreau@brandshift.test",
    source: "Existing client",
  },
  {
    title: "Loyalty programme identity",
    companyName: "Northwind Retail",
    contactName: "Aisha Rahman",
    stage: "lead",
    value: null,
    closesInDays: null,
    ownerEmail: "elena.rossi@brandshift.test",
    source: "Existing client",
  },
  {
    title: "Sustainability campaign, EU",
    companyName: "Lumen Energy",
    contactName: "Greta Lindholm",
    stage: "proposal",
    value: 120000,
    // Past its date and still open: the list marks it late, which is most of
    // the reason the list exists.
    closesInDays: -6,
    ownerEmail: "sofia.laurent@brandshift.test",
    source: "Pitch",
  },
  {
    title: "Onboarding revamp",
    companyName: "Harbour Group",
    contactName: "Daniel Okonkwo",
    stage: "won",
    value: 56000,
    closesInDays: -30,
    ownerEmail: "tom.decker@brandshift.test",
    source: "Referral",
  },
  {
    title: "Q4 retainer renewal",
    companyName: "Orbit Media",
    contactName: "Ruth Adeyemi",
    stage: "lost",
    value: 64000,
    closesInDays: -75,
    ownerEmail: "amina.benali@brandshift.test",
    source: "Existing client",
    lostReason: "Their new CMO brought an agency with her. Nothing to do with the work.",
  },
  {
    title: "Rebrand, retail estate",
    companyName: "Verdant Foods",
    contactName: "Juliette Renard",
    stage: "lost",
    value: 150000,
    closesInDays: -50,
    ownerEmail: "sofia.laurent@brandshift.test",
    source: "Pitch",
    lostReason: "Priced above budget by about a third. Worth revisiting at a smaller scope.",
  },
];

/**
 * Quotes, invoices and expenses.
 *
 * Every status is represented, because the states that go wrong quietly are
 * the ones nobody looks at: an invoice past its date, a part payment, a void
 * with a reason on it, a quote that expired without an answer.
 *
 * Amounts are written the way somebody would type them. The seed parses them
 * with the same function the form does, so a seeded figure and a typed one go
 * through identical arithmetic.
 */
export type SeedLine = {
  description: string;
  /** As typed: "1", "1.5", "0.125". */
  quantity: string;
  /** As typed: "800", "12 500", "1 234,56". */
  unitPrice: string;
  /** Basis points: 2000 is 20%. */
  tax: number;
  /** What the line covers, one bullet per entry. */
  details?: string[];
  /** What it explicitly does not, printed muted and last. */
  exclusions?: string[];
};

/**
 * The conditions block, as it reads on a real Mediast devis.
 *
 * Boilerplate an agency reuses rather than retypes, which is why it is one
 * constant and not a field on each quote. It is free text and prints one
 * bullet per line -- the person writing the quote decides the wording, and
 * the deposit percentage lives here rather than in a column, because it is a
 * sentence that gets negotiated and not a number the software computes.
 */
export const QUOTE_TERMS = [
  "Payment: 40% deposit on signature, the balance on delivery.",
  "Revisions: as set out against each line above.",
  "Ownership: deliverables transfer on final payment. Mediast keeps the source files and may show the work in its portfolio.",
  "This offer stands until the validity date shown above.",
].join("\n");

/** The same, for a document that is already owed rather than proposed. */
export const INVOICE_TERMS = [
  "Payable by bank transfer to the account on file, quoting the invoice number.",
  "Late payment is subject to interest at the statutory rate.",
  "Queries on this invoice should reach us within 14 days of its date.",
].join("\n");

export type SeedQuote = {
  companyName: string;
  title: string;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  /** Days from today. Negative is in the past. */
  issuedInDays: number;
  validForDays: number | null;
  ownerEmail: string;
  declineReason?: string;
  lines: SeedLine[];
};

export const QUOTES: SeedQuote[] = [
  {
    companyName: "Verdant Foods",
    title: "Packaging refresh, full range",
    status: "sent",
    issuedInDays: -8,
    validForDays: 30,
    ownerEmail: "sofia.laurent@brandshift.test",
    lines: [
      {
        description: "Discovery and audit",
        quantity: "5",
        unitPrice: "900",
        tax: 2000,
      },
      {
        description: "Structural design, six SKUs",
        quantity: "18",
        unitPrice: "850",
        tax: 2000,
      },
      {
        description: "Artwork and print liaison",
        quantity: "12",
        unitPrice: "750",
        tax: 2000,
      },
      {
        description: "Print sample production",
        quantity: "1",
        unitPrice: "4 200",
        tax: 550,
      },
    ],
  },
  {
    companyName: "Kestrel Partners",
    title: "Annual report and investor deck",
    status: "sent",
    issuedInDays: -3,
    validForDays: 21,
    ownerEmail: "claire.moreau@brandshift.test",
    lines: [
      {
        description: "Editorial and structure",
        quantity: "8",
        unitPrice: "950",
        tax: 2000,
      },
      {
        description: "Layout, 64 pages",
        quantity: "20",
        unitPrice: "800",
        tax: 2000,
      },
      {
        description: "Investor deck, 30 slides",
        quantity: "10",
        unitPrice: "850",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Harbour Group",
    title: "Onboarding revamp",
    status: "accepted",
    issuedInDays: -45,
    validForDays: 30,
    ownerEmail: "tom.decker@brandshift.test",
    lines: [
      {
        description: "Service design workshops",
        quantity: "6",
        unitPrice: "1 100",
        tax: 2000,
      },
      {
        description: "Journey mapping and prototypes",
        quantity: "22",
        unitPrice: "820",
        tax: 2000,
      },
      {
        description: "Handover and training",
        quantity: "4",
        unitPrice: "900",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Orbit Media",
    title: "Q4 retainer renewal",
    status: "declined",
    issuedInDays: -80,
    validForDays: 30,
    ownerEmail: "amina.benali@brandshift.test",
    declineReason: "Their new CMO brought an agency with her. Nothing to do with the price.",
    lines: [
      {
        description: "Retainer, three months",
        quantity: "3",
        unitPrice: "18 000",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Lumen Energy",
    title: "Sustainability campaign, EU",
    status: "expired",
    issuedInDays: -70,
    validForDays: 21,
    ownerEmail: "sofia.laurent@brandshift.test",
    lines: [
      {
        description: "Campaign strategy",
        quantity: "10",
        unitPrice: "1 000",
        tax: 2000,
      },
      {
        description: "Film production, five markets",
        quantity: "1",
        unitPrice: "78 000",
        tax: 2000,
      },
      {
        description: "Paid media assets",
        quantity: "15",
        unitPrice: "700",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Meridian Bank",
    title: "Phase two: internal brand",
    status: "draft",
    issuedInDays: 0,
    validForDays: 45,
    ownerEmail: "claire.moreau@brandshift.test",
    // The one seeded document with its scope spelled out, because it is the
    // one the print and PDF specs render: a sheet with no bullets on it would
    // let the whole inclusion/exclusion layer rot untested.
    lines: [
      {
        description: "Internal audit and interviews",
        quantity: "8",
        unitPrice: "950",
        tax: 2000,
        details: [
          "Twelve interviews across the four departments, transcribed",
          "Findings deck and a half-day readout with the steering group",
        ],
        exclusions: ["Travel outside Meknès, billed at cost"],
      },
      {
        description: "Toolkit and templates",
        quantity: "16",
        unitPrice: "820",
        tax: 2000,
        details: [
          "Messaging framework: positioning, pillars, proof points",
          "Slide, document and email templates in the bank's own fonts",
        ],
        exclusions: ["Rollout training for line managers, quoted separately"],
      },
    ],
  },
];

export type SeedInvoice = {
  companyName: string;
  projectKey: string | null;
  title: string;
  status: "draft" | "sent" | "part_paid" | "paid" | "void";
  issuedInDays: number;
  dueInDays: number;
  /** As typed, for part payments. */
  paid?: string;
  voidReason?: string;
  lines: SeedLine[];
};

export const INVOICES: SeedInvoice[] = [
  {
    companyName: "Meridian Bank",
    projectKey: "MER",
    title: "Meridian rebrand, stage one",
    status: "paid",
    issuedInDays: -55,
    dueInDays: -25,
    lines: [
      {
        description: "Positioning and strategy",
        quantity: "20",
        unitPrice: "950",
        tax: 2000,
      },
      {
        description: "Identity development",
        quantity: "30",
        unitPrice: "880",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Meridian Bank",
    projectKey: "MER",
    title: "Meridian rebrand, stage two",
    status: "part_paid",
    issuedInDays: -20,
    dueInDays: 10,
    paid: "15 000",
    lines: [
      {
        description: "Rollout kit, 40 branches",
        quantity: "35",
        unitPrice: "860",
        tax: 2000,
      },
      {
        description: "Signage specification",
        quantity: "12",
        unitPrice: "800",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Northwind Retail",
    projectKey: "NOR",
    title: "Replatform, milestone two",
    status: "sent",
    // Past its date and unpaid: the finance screen opens on this.
    issuedInDays: -50,
    dueInDays: -20,
    lines: [
      {
        description: "Catalogue migration",
        quantity: "28",
        unitPrice: "820",
        tax: 2000,
      },
      {
        description: "Checkout rebuild",
        quantity: "34",
        unitPrice: "880",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Harbour Group",
    projectKey: "HAR",
    title: "Onboarding revamp, deposit",
    status: "sent",
    issuedInDays: -5,
    dueInDays: 25,
    lines: [
      {
        description: "Deposit, 40% of agreed fee",
        quantity: "1",
        unitPrice: "13 400",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Lumen Energy",
    projectKey: "LUM",
    title: "Campaign assets, first batch",
    status: "draft",
    issuedInDays: 0,
    dueInDays: 30,
    lines: [
      {
        description: "Social cutdowns, nine formats",
        quantity: "9",
        unitPrice: "650",
        tax: 2000,
      },
    ],
  },
  {
    companyName: "Orbit Media",
    projectKey: "ORB",
    title: "Retainer, September",
    status: "void",
    issuedInDays: -35,
    dueInDays: -5,
    voidReason: "Issued against the old retainer rate. Replaced by INV-2026-0007.",
    lines: [
      {
        description: "Retainer, one month",
        quantity: "1",
        unitPrice: "6 000",
        tax: 2000,
      },
    ],
  },
];

export type SeedExpense = {
  description: string;
  category: "subcontractor" | "software" | "travel" | "equipment" | "production" | "other";
  spentInDays: number;
  amount: string;
  tax: string;
  supplier: string | null;
  projectKey: string | null;
  paidByEmail: string;
  reimbursable: boolean;
  reimbursed?: boolean;
};

export const EXPENSES: SeedExpense[] = [
  {
    description: "Freelance motion designer, two weeks",
    category: "subcontractor",
    spentInDays: -12,
    amount: "4 800",
    tax: "960",
    supplier: "Callum Reid",
    projectKey: "LUM",
    paidByEmail: "amina.benali@brandshift.test",
    reimbursable: false,
  },
  {
    description: "Figma, annual, twelve seats",
    category: "software",
    spentInDays: -40,
    amount: "5 760",
    tax: "1 152",
    supplier: "Figma",
    projectKey: null,
    paidByEmail: "tom.decker@brandshift.test",
    reimbursable: false,
  },
  {
    description: "Train to Lyon, Verdant pitch",
    category: "travel",
    spentInDays: -6,
    amount: "184.50",
    tax: "18.45",
    supplier: "SNCF",
    projectKey: null,
    paidByEmail: "sofia.laurent@brandshift.test",
    reimbursable: true,
  },
  {
    description: "Print samples, packaging mock-ups",
    category: "production",
    spentInDays: -9,
    amount: "612.40",
    tax: "122.48",
    supplier: "Atelier Papier",
    projectKey: "VER",
    paidByEmail: "marc.dubois@brandshift.test",
    reimbursable: true,
  },
  {
    description: "Colour-calibrated monitor",
    category: "equipment",
    spentInDays: -70,
    amount: "1 240",
    tax: "248",
    supplier: "Eizo",
    projectKey: null,
    paidByEmail: "yusuf.karim@brandshift.test",
    reimbursable: true,
    reimbursed: true,
  },
  {
    description: "Photography, Northwind product shoot",
    category: "production",
    spentInDays: -22,
    amount: "3 400",
    tax: "680",
    supplier: "Studio Nord",
    projectKey: "NOR",
    paidByEmail: "elena.rossi@brandshift.test",
    reimbursable: false,
  },
];
