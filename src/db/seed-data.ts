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
    name: "Ines Ferreira",
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
    description:
      "Rolling design and content retainer for Orbit. Scoped monthly, invoiced monthly.",
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
