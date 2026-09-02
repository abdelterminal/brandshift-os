# Roadmap

Work top to bottom. Check items off as they land. Stop for confirmation at the end of each
milestone before starting the next.

Anything deferred rather than done goes in `KNOWN-GAPS.md`, in the same commit.

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

### M2 - Design system  [DONE]

- [x] `src/app/tokens.css` -- full palette as CSS custom properties on `:root`, redefined under
      `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`; Tailwind v4 `@theme inline`
      maps them to utilities. No component ever writes a raw hex.
- [x] Neutral ramps for both themes, contrast-checked to WCAG AA. `src/app/tokens.test.ts`
      resolves every semantic token through its `var()` chain in both themes and fails the build
      on any pair below 4.5:1 for text or 3:1 for control edges and focus rings.
- [x] Status semantics: brand red, green, amber, blue -- one meaning each
- [x] Space Grotesk + Inter, self-hosted variable woff2 in `src/app/fonts/`; type scale with a
      14px body default and a hard 12px floor, both asserted by the same test
- [x] `/design` -- the reference page, read live from `tokens.css` by the same parser the test
      uses, so the swatches and ratios it shows cannot drift from what ships
- [x] **Present palette and type scale for approval before building screens** -- approved
- [x] Primitives in `src/components/ui/`: Button, Input (+ Textarea, Field), Select, Combobox,
      Badge / StatusPill / CountBadge, Table, Card, Tabs, Dialog, Drawer, Toast, EmptyState
      (+ ErrorState), Skeleton (+ TableSkeleton), Avatar (+ AvatarGroup), Tooltip -- each with
      default / hover / focus-visible / active / disabled / loading states
- [x] `/design/primitives` -- every control in every state, so a missing one is visible

Decisions taken while building it, for the approval conversation:
- **#FD0000 carries white text at only 4.06:1**, below the 4.5:1 AA needs for a 14px button
  label. The ramp keeps 500 as the exact brand red for identity and non-text use (logo, active
  nav indicator, focus ring, where the bar is 3:1) and puts the interactive fill one step down
  at 600, which reaches 5.84:1. Both are the brand red; only one is legible under a label.
- Neutrals are warm (OKLCH hue 40, chroma <= 0.008) rather than blue-grey, so charcoal sits with
  the red instead of fighting it. The dark canvas is `#1a1615`, not black.
- Status `-solid` tokens are non-text marks only -- dots, bars, rail indicators. Text on a status
  colour uses the `-bg` / `-text` pair. This is the one combination the tokens do not support,
  and the test enforces it.
- Theme has three states, not two: `system` stamps nothing and follows the OS; an explicit
  choice writes `data-theme` and wins in both directions.

Found while building the primitives:
- **tailwind-merge silently dropped colours.** It infers whether an unknown `text-*` utility is
  a size or a colour from its value, so it filed `text-label` and `text-caption` as colours and
  discarded the real colour beside them as a conflict. Every primary button lost its white label
  and inherited near-black text on red. `src/lib/utils.ts` now registers our type scale, radii
  and shadows with `extendTailwindMerge`, and `src/lib/utils.test.ts` pins it.
- The scaffolded shadcn Button nudged itself down a pixel on `:active`. That is a transform, it
  makes a toolbar twitch under the cursor, and it is gone.
- Loading and disabled looked identical -- both dimmed to 55%. Greyed out says "you cannot do
  this" when the truth is "this is happening", so loading keeps full opacity and carries a
  spinner and a softened label instead.
- The scaffold installed **Base UI**, not Radix, as shadcn/ui's primitive layer. `CLAUDE.md` said
  Radix; the stack table now matches the code.

### M3 - The shell  [DONE]

- [x] `next-intl` wired end to end: `src/i18n/`, `src/middleware.ts`, routes under
      `src/app/[locale]/`, `messages/en.json` and `messages/fr.json` both complete.
      `src/i18n/messages.test.ts` fails the build on a key, placeholder or empty string that
      exists in one catalogue and not the other.
- [x] `src/app/[locale]/(app)/layout.tsx`
- [x] Left rail, max 5 destinations per role -- the cap is enforced in `railFor()`, which throws
      rather than quietly rendering a sixth
      - Admin: Today - Work - People - Insights - Inbox
      - Member: Today - My Work - Calendar - Inbox - Team
      - Profile and Settings only in the avatar menu, asserted by `navigation.test.ts`
- [x] Cmd+K command palette: jumps to any project, person or department, accent-insensitively
- [x] Org switcher, theme toggle, `en`/`fr` switcher, breadcrumbs
- [x] Right-hand context panel slot -- a `@panel` parallel route, so a page fills it by rendering
      into it and every other page leaves it empty without saying so
- [x] Mobile bottom nav: the first four rail destinations, the rest behind More in a bottom sheet
- [x] Rail data shape leaves room to nest channels under Work items in Phase 2 (`children`,
      `expandable`)

Built here although the roadmap places them later, because the shell could not be honest without
them:
- **`src/lib/authz.ts`.** Which destinations you see is a permission decision, and CLAUDE.md says
  those live in exactly one place. Writing nav-only rules would have created the second place M4
  then had to merge. M4 extends it with session enforcement, Server Action guards and the re-auth
  window; the shape is built to be extended.
- **`src/lib/session.ts` is a stopgap.** There is no sign-in yet, so `getCurrentUser()` reads a
  real person out of the seeded org -- `DEV_USER_EMAIL` picks which -- and the shell renders real
  names, roles and organizations rather than invented ones. M4 replaces the body of that one
  function and nothing above it changes.
- **`findMembershipsForUser()` in `tenancy.ts`.** The one read of a tenant table that cannot be
  scoped, because it is what establishes the scope. It is filtered by user id instead, and lives
  in the file that owns tenancy so the exception stays visible.

Bugs found while building it:
- **A single-string middleware matcher silently matches nothing** in Next 16 once the lookahead
  contains the `.*\..*` alternative. `/today` never reached the middleware and 404ed instead of
  redirecting. Split into the three patterns next-intl documents, it works.
- **Middleware must live in `src/`**, not the repo root, when `app/` is under `src/`.
- **Icons cannot cross the RSC boundary.** The rail is assembled on the server and handed to a
  Client Component; a React component is a function. Destinations name their icon as a string and
  `nav-icons.ts` resolves it on the client.
- **The command palette was mounted twice**, once per breakpoint, so Cmd+K opened two stacked
  dialogs -- the portal is outside the `lg:hidden` wrapper that was meant to hide one. One
  instance now, with a trigger that adapts.
- **The shell was being statically prerendered** with one user's rail and organization baked into
  HTML served to everyone, and it needed a database at build time, which the Docker image has no
  access to. The `(app)` segment is `force-dynamic`.

### M4 - Auth, orgs, RBAC  [DONE]

- [x] Login, logout, signup-with-org (organization + owner in one transaction), password change
- [x] HttpOnly cookie JWT + `sessions` digest. **The digest check runs in the page, not the
      middleware** -- see DECISIONS.md for why, and for what that does and does not change.
- [x] Session list with per-device revoke, and "sign out everywhere else"
- [x] `src/lib/authz.ts` -- `can(actor, action, resource)`, called by the rail and by the pages.
      `/insights` enforces the same `insights.view` the rail hides it on.
- [x] 403 preserves the session; 401 clears it (`forbidden.tsx` / `unauthorized.tsx`)
- [x] Routine writes never prompt for a password. The 15-minute re-auth window guards device
      revocation only; signing in counts as authenticating, so it rarely fires.
- [x] Login page fixes the old accessibility bugs: real `<label for>`, a named
      password-visibility `<button>` carrying `aria-pressed`, and errors as text in a live region

Also done here:
- Sign-in cannot be used to enumerate accounts: one message for both halves of the credential, and
  a dummy hash verified when no user matches, so a missing email takes as long as a wrong password.
- `?next=` is validated -- a path within the app, never an absolute or protocol-relative URL,
  which is the classic open redirect on a sign-in link.
- Rejected forms keep what was already typed, except the password.

Bugs and violations found while building it:
- **The tenancy guard caught two real violations** in the new auth actions: a raw
  `.from(memberships)` and a raw `tx.insert(memberships)`. The first became
  `findMembershipsForUser()`, the second `withOrg(orgId, tx).insert(...)` -- which needed
  `withOrg()` to accept a transaction, so it now does.
- **The guard itself was too blunt** and flagged the correct scoped call alongside the wrong one.
  It now anchors insert/update/delete on the receiver, so `db.insert(x)` is a violation and
  `withOrg(id).insert(x)` is not. Verified by planting a violation and watching it fail.
- **`withOrg().insert()` typed its values as `PgInsertValue<T>`**, which does not resolve
  per-table when `T` is generic -- every caller was offered a shape with none of its own columns.
  It uses `T["$inferInsert"]` now.
- **`relativeTime` had no reference point**, so the server rendered "2 seconds ago" and the client
  re-rendered "3 seconds ago" -- an intermittent hydration mismatch. `now` is fixed per request in
  `src/i18n/request.ts`.
- Breadcrumbs showed `settings` and `profile` as raw lowercase segments; their labels live in the
  `Account` namespace, not `Nav`.

### M5 - First vertical slice  [DONE]

- [x] **People**: directory, server-paginated and filtered through the URL; person detail as a
      routed page with Overview / Work / Activity tabs; invite flow; role and module editing
- [x] **Work**: projects list; project detail as a **routed page** with Overview / Tasks / Team /
      Activity tabs -- not a modal
- [x] Tasks default to a prioritised list (Overdue - Today - Upcoming - No deadline - Completed);
      Kanban is behind a toggle and has to be asked for
- [x] Task opens in a **side drawer** with Start / Complete / Report blocker. The open task is
      `?task=<id>`, so back closes it and a link to a task opens it.
- [x] Guided project creation: essentials -> department -> assignment with visible workload ->
      deliverables -> review and publish. Nothing is written until the last step, and then it is
      written in one transaction.
- [x] **Today**, action-first: manager and above get the coordination queue
      (blocked / overdue / unassigned); a member gets a Next Task panel and Now / Next / Later

Every number on these screens is a count of rows you can click through to. There are no invented
metrics, which is why there is no chart anywhere yet.

Found while building it:
- **The role editor started with every module unticked** instead of the person's current access,
  so saving would have silently revoked it. `PersonRow` carries `permissions` now.
- **The wizard's name field was uncontrolled**, so its own state never saw what was typed:
  Continue stayed disabled forever and the name would never have been submitted. `TextField`
  takes `value` / `onValueChange` now.
- **next-intl rejects a message key containing a dot**, which is how it expresses nesting -- so
  the `Activity` catalogue could not be keyed by verb (`task.completed`). The verbs stay dotted in
  the database; the feed flattens them to `taskCompleted` when it looks the message up.
- **Client components cannot import a value from a `server-only` module.** `BUCKET_ORDER` did,
  which dragged the database driver into the browser bundle and failed the build with a stack of
  missing Node built-ins. The client-safe shapes live in `src/lib/data/task-types.ts` now.
- **The message-parity test had two false positives of its own.** Its placeholder regex read ICU
  plural sub-messages as arguments, so `{days, plural, one {in # day} ...}` looked like it had an
  argument called `in`, and the French `{dans # jour}` failed. It counts braces now and only reads
  arguments at depth zero.
- `withOrg()` gained `selectJoined()`: lists need the assignee's name beside the task, and
  `selectFields` applies its `where` immediately so nothing can be joined after it. Joins are
  passed as data, not a callback, so the helper still applies the tenant filter last.

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
npm run test:e2e
docker compose up -d --build && curl localhost:3000/api/health
```

`test:e2e` covers both locales, 320/375/768/1024/1440px, and axe on every route -- so those are
no longer a manual pass. What is still manual: keyboard-only navigation, and looking at the thing.
Screenshot the real running app; do not report a screen done from the code alone.

A new screen needs its route added to `e2e/routes.ts`, or the two sweeps will not know it exists.
