# Roadmap

Work top to bottom. Check items off as they land. Stop for confirmation at the end of each
milestone before starting the next.

---

## Phase 1 -- Foundation + first vertical slice

### M0 - Repo scaffold  [DONE]

- [x] Next.js 16 + TypeScript + Tailwind v4 + ESLint scaffold
- [x] shadcn/ui initialised
- [x] Core dependencies: drizzle-orm, pg, jose, zod, next-intl, lucide-react
- [x] Brand assets carried over to `public/brand/`
- [x] `CLAUDE.md`, `DECISIONS.md`, `ROADMAP.md`, `README.md`
- [x] Private GitHub repo `abdelterminal/brandshift-os`, pushed

### M1 - Data foundation  [DONE]

- [x] `docker-compose.yml`: `postgres:17-alpine` (named volume + healthcheck) and `app`
      (Next standalone, depends on healthy db). Postgres not exposed beyond loopback.
      Host port is `DB_PORT`, so a machine already running Postgres on 5432 can move it.
- [x] `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `SESSION_TTL`, validated by `src/lib/env.ts`
- [x] `drizzle.config.ts` + `db:generate` / `db:migrate` / `db:seed` scripts
- [x] Schema in `src/db/schema/` -- every tenant-owned table carries `organization_id`:
      `organizations`, `users`, `memberships`, `sessions`, `departments`,
      `projects`, `project_members`, `tasks`, `activity_events`
- [x] `src/db/tenancy.ts` -- `withOrg()`, the only sanctioned tenant-table query path.
      `src/db/tenancy.test.ts` fails the build on a tenant table touched from outside
      `src/db`, and on a new `organization_id` table that is neither scoped nor exempted.
- [x] `src/db/seed.ts` -- 1 org, 12 users across 4 departments and all 4 roles, 8 projects,
      60 tasks; the spread (overdue, blocked, unassigned, undated, every status) is asserted
      at the end of the run rather than left to chance
- [x] `/api/health` returning db readiness -- 200 / 503, no driver detail in the response

Not in M1, decided while building it:
- `src/lib/password.ts` uses Node's built-in scrypt. bcrypt and argon2 are native modules, and
  this repo is built on Windows and shipped on Alpine; a prebuilt binary missing on one of them
  is a recurring build failure for no security gain.
- `sessions` carries `organization_id` but is **not** tenant-scoped: it is looked up by token
  digest before any org is known. The exemption is recorded in `ORG_COLUMN_EXCEPTIONS`.

### M2 - Design system

- [ ] `src/app/tokens.css` -- full palette as CSS custom properties on `:root`, redefined under
      `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`; Tailwind v4 `@theme` maps
      them to utilities. No component ever writes a raw hex.
- [ ] Neutral ramps for both themes, contrast-checked to WCAG AA
- [ ] Status semantics: brand red, green, amber, blue -- one meaning each
- [ ] Space Grotesk + Inter, self-hosted; type scale, 14-16px body floor
- [ ] **Present palette and type scale for approval before building screens**
- [ ] Primitives: Button, Input, Select, Combobox, Badge/StatusPill, Table, Card, Tabs, Dialog,
      Drawer, Toast, EmptyState, Skeleton, Avatar, Tooltip -- each with default / hover /
      focus-visible / active / disabled / loading states

### M3 - The shell

- [ ] `src/app/[locale]/(app)/layout.tsx`
- [ ] Left rail, max 5 destinations per role
      - Admin: Today - Work - People - Insights - Inbox
      - Member: Today - My Work - Calendar - Inbox - Team
      - Profile and Settings only in the avatar menu
- [ ] Cmd+K command palette: jump to any project, person or department; run actions
- [ ] Org switcher, theme toggle, `en`/`fr` switcher, breadcrumbs
- [ ] Right-hand context panel slot
- [ ] Mobile bottom nav (Today - Work - Calendar - Inbox - More), bottom-sheet filters
- [ ] Rail data shape leaves room to nest channels under Work items in Phase 2

### M4 - Auth, orgs, RBAC

- [ ] Login, logout, signup-with-org, password change
- [ ] HttpOnly cookie JWT + `sessions` digest check in middleware
- [ ] Session list with per-device revoke
- [ ] `src/lib/authz.ts` -- `can(user, action, resource)`, used by both UI and Server Actions
- [ ] 403 preserves the session; 401 clears it
- [ ] Routine writes never prompt for a password; re-auth window for destructive actions only
- [ ] Login page fixes the old accessibility bugs: real labels, named password-visibility toggle

### M5 - First vertical slice

- [ ] **People**: employees list (server-paginated, filterable); person detail as a routed page
      with Overview / Work / Activity tabs; departments; invite flow; role and permission editing
- [ ] **Work**: projects list; project detail as a **routed page** with Overview / Tasks / Team /
      Activity tabs -- not a modal
- [ ] Tasks default to a prioritized list (Today - Upcoming - No deadline - Completed);
      Kanban is the secondary view
- [ ] Task opens in a **side drawer** with Start / Complete / Report Blocker
- [ ] Guided project creation: essentials -> department -> assignment with visible workload ->
      deliverables -> review and publish
- [ ] **Today**, action-first, using Phase-1 data only:
      admin = coordination queue (blocked / overdue / unassigned);
      member = Next Task panel + Now / Next / Later

---

## Phase 2 -- Breadth

Ordered, not yet scheduled.

- Inbox and notifications
- Channels: project and deal channels on the `activity_events` spine, presence, read state
- Calendar and Meetings
- Attendance and leave
- Insights and reporting
- **CRM**: contacts, companies, leads, pipeline/deals, activities
- **ERP**: quotes, orders, invoices, expenses
- Data migration from the old MongoDB app, once the schema has settled

---

## Verification gate (every milestone)

```bash
npm run lint && npx tsc --noEmit
npm run test
npx playwright test
docker compose up -d --build && curl localhost:3000/api/health
```

Manual: both themes - both locales - 320/375/768/1024/1440px - keyboard-only pass - axe clean.
Screenshot the real running app; do not report a screen done from the code alone.
