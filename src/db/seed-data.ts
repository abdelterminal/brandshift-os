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
  slug: "brandshift",
  name: "BrandShift",
  timezone: "Europe/Paris",
  defaultLocale: "fr" as const,
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
      "The component library and token set behind every BrandShift client build. Ships in light and dark.",
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
  { title: "Book the Q4 all-hands room", assigneeEmail: "tom.decker@brandshift.test" },
  {
    title: "Review the new starter handbook",
    assigneeEmail: "tom.decker@brandshift.test",
  },
  { title: "Renew the font licences", assigneeEmail: "yusuf.karim@brandshift.test" },
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
