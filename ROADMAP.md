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

### Inbox and notifications  [DONE]

- [x] `notifications` table: one row per person per event, attached to `activity_events` rather
      than duplicating it -- the spine DECISIONS.md set aside for exactly this
- [x] Fan-out on write, in one readable table of rules in `src/lib/data/notifications.ts`, called
      from `recordActivity()` so an action cannot record history and tell nobody
- [x] **You are never notified of your own action.** An inbox that echoes what you just did is one
      people learn to ignore, and then it swallows the message that mattered
- [x] Inbox screen: grouped Today / Earlier, unread marked three ways, opening one marks it read
      and takes you to the thing it is about
- [x] Unread count on the rail and a dot on the mobile bar -- a real count of rows you can act on
- [x] Seeded, with the same rules, so a fresh database has a plausible inbox rather than none

Decisions worth knowing:
- Fan-out on write rather than deriving the inbox from a query. It costs a few rows per event and
  buys per-person read state and an unread count that is one indexed count, not a scan of the
  whole feed re-filtered for relevance on every page load.
- Read state only -- there is no archive or dismiss yet. Read/unread covers the core; a third
  state can wait until somebody wants it.
- Still no email or push. That needs a mail transport, which nothing here has yet.

### Channels  [DONE]

- [x] `channels` / `channel_members` / `messages`, all tenant-owned and registered in
      `TENANT_TABLES`. Read state is one `last_read_at` per person per channel, not a receipt per
      message: "everything before this moment is read" is what an unread badge needs, and it stays
      one row however long the channel gets
- [x] **A project channel is the project's history with people talking in it.** The feed
      interleaves `activity_events` and `messages` in one column, in the order they happened --
      the spine `DECISIONS.md` set aside for exactly this
- [x] Long runs of routine activity fold to a count; blockers, status changes and role changes are
      never folded. Fifteen "assigned a task" lines in a row turn a conversation into a log
- [x] Nested under Work in the rail, with a per-channel unread badge and "All channels" as the way
      to the ones you have not joined. Children, not a sixth destination -- the cap of five is
      what keeps the rail scannable
- [x] **Live, on Postgres.** A write calls `pg_notify`; one `LISTEN` connection per process fans
      it out over Server-Sent Events. No Redis, no websocket gateway, nothing new to run
- [x] Presence derived from the open SSE connections, so a closed tab removes somebody with
      nothing to expire and nothing to clean up after a crash
- [x] Read means "you reached the end", not "you opened it", and the badge clears where you are
      standing rather than on the next navigation
- [x] Edit and delete keep the row and stamp a time -- a channel where a message can vanish
      without trace is one nobody can rely on as the record of a decision
- [x] Seeded: nine channels, forty memberships and eighteen real exchanges that go with the seeded
      tasks, so a fresh database reads like a week of use

Decisions worth knowing:
- **A message does not reach the inbox.** Unread state is the channel's own signal; the inbox
  stays for the few things that need one specific person. Two queues saying the same thing means
  people read neither. Mentions will change this, and will be the reason to.
- **A `change` event carries no message in it.** The browser refetches through the same server
  components a page load uses, so what arrives live and what arrives on a refresh come from one
  code path and cannot drift apart. It costs a round trip and buys never reconciling two renders
  of the same conversation.
- SSE rather than websockets, because the traffic is one-way and this deploys as one Docker
  container on a local network.
- Opening a channel does not join it -- if it did, Leave would undo itself on the next render.
  Pressing Join does, and so does saying something.
- Deals get channels when CRM does. `channel_kind` already names them, so that is a row, not a
  migration.

### Calendar and Meetings  [DONE]

- [x] **The calendar owns nothing.** Meetings live in `meetings`; task and project
      deadlines are read off the rows that own them. An `events` table a deadline is copied into
      is a calendar that disagrees with the task by the end of the week, and then two places to fix
- [x] Agenda by default, month grid when asked -- a list answers "what have I got on" and a grid
      answers "what shape is my month", and people arrive with the first question. The same call as
      lists before boards
- [x] Every choice is in the URL -- range, whose, layout, which week -- so a calendar view can be
      sent to somebody rather than described over the phone
- [x] `meetings` / `meeting_attendees`, both tenant-owned. `needs_action` is a real answer, not a
      null: an organizer has to see who has not replied
- [x] **Clashes are shown while you are still choosing.** The guest list checks each person against
      the chosen slot as you tick them, the same idea as the project wizard showing someone's
      workload at the moment you assign them
- [x] Moving a meeting withdraws every answer. A yes was a yes to a time
- [x] Cancelling keeps the row and says so in words. People blocked an hour out for it
- [x] Notes -- what was decided -- writable by anyone who was there, which is the only reason a
      past meeting is worth keeping on the calendar
- [x] `can()` finally uses its resource argument: whether you may move a meeting depends on who
      called it, not on your role alone
- [x] Next up on Today, above the work, because a call in twenty minutes changes what you start
- [x] The command palette now knows about screens, so a manager -- whose five rail destinations
      leave no room for Calendar -- can still get there by name
- [x] Seeded: eight meetings either side of today, one already cancelled and two already written up

Decisions worth knowing:
- **Times are the organization's clock.** `datetime-local` carries no zone, and everyone booking a
  meeting means the time in the studio. The offset is measured at the instant in question rather
  than assumed, because Paris is +01:00 in January and +02:00 in July.
- Meetings are the only thing on the calendar that notify. A deadline is already visible on the
  task; a meeting moves somebody else's day.
- No recurrence, no external calendar sync, no reminders. Each is its own feature rather than a
  corner of this one -- see `KNOWN-GAPS.md`.

### Attendance and leave  [DONE]

Scope taken deliberately, because the roadmap line was two words: **leave requests, approval and
balances, and attendance as _who is in and who is not_ -- not a timeclock.** Twelve salaried people
in a studio do not punch a clock; what anybody actually needs is to know who is away. Billable-hours
timesheets are a separate feature and belong beside ERP invoicing.

- [x] `leave_requests`, tenant-owned. A declined or withdrawn request keeps its row: "I asked and
      was told no" is a fact people need to be able to point at
- [x] **A balance is computed, never stored** -- the allowance on the membership minus approved
      annual days in the year. A stored balance is a number that goes silently wrong the first time
      an approval is withdrawn. Same discipline as the calendar owning no rows
- [x] Split into taken, booked and left, because "eighteen days left" answers a different question
      from "eighteen left, six already promised to a holiday in November"
- [x] Only annual leave spends the allowance. Sick leave is not a budget, and treating it as one is
      how a company teaches its staff to come in ill
- [x] Weekends cost nothing, and the working-day count on the form is the same function the server
      stores -- so the number you were shown and the number that leaves your balance cannot differ
- [x] Half days, for a single-day request only. Half of a fortnight is not something this form can
      express, so it does not pretend to
- [x] **Nobody signs off their own request**, whatever their role -- enforced in the data layer and
      in `can()`, so the hidden button and the refused write agree
- [x] A refusal carries a reason. A no with no reason is one people ask about again in person
- [x] Approved leave appears on the calendar, per working day. No second calendar was built
- [x] Scheduling a meeting now says **Away** rather than **Busy** when somebody is on approved
      leave: one can be moved and the other cannot
- [x] Requests reach the people who can decide, and decisions reach the person who asked
- [x] Seeded across every status, including a refusal with a reason and a withdrawal

Decisions worth knowing:
- Attendance is derived from leave rather than recorded separately. There is no "present" row for a
  normal day, because a normal day is not an event.
- Public holidays are not modelled, so a week off over Christmas costs five days here and four in
  reality. A hardcoded list of somebody else's national holidays would be worse than the gap.
- The allowance lives on the membership, not the user: it is a term of employment with one
  organization.

### Insights and reporting  [DONE]

Shaped entirely by two rules that were already written down, and which most reporting screens
break on their first day: **no invented dashboard metrics**, and **lead with next actions and
exceptions, never vanity totals**.

- [x] Opens with **At risk** -- projects with blocked work, late work, or a deadline already
      behind them. Only the ones with something wrong; the healthy projects are already on Work
- [x] **Stuck longest**, ordered by duration rather than importance, with the blocker's own words
      on the row. The thing blocked for three weeks is the one nobody is looking at any more
- [x] **Keeping up** -- tasks created against tasks completed, by week. The pair, never either
      alone: forty completed says nothing, forty against sixty says the queue is growing
- [x] **What everyone is carrying** -- open, late and blocked work, plus the two things that
      quietly eat a week: hours already committed to meetings, and days somebody will not be here
- [x] Every number traces to a row somebody made by using the app. Nothing is estimated, weighted
      or scored, and there is no headline figure anywhere on the screen
- [x] The chart is a real `<table>` with bars drawn on it -- no charting dependency, exact numbers
      beside every bar, and a screen reader gets a table rather than an SVG
- [x] No inline `style`, which the rule forbids: bar widths come from a fixed set of classes

Decisions worth knowing:
- **There is no productivity metric, and no "tasks completed" beside anybody's name.** A count of
  tasks is not a count of value, and putting one next to a person turns a planning tool into a
  scoreboard. The load table shows what somebody is carrying, never what they have got through.
- Counted in memory from a few hundred rows. The day that is not true, each of these becomes a
  `date_trunc` and a `group by` behind the same shape.
- Twelve weeks, because a month is too coarse to show a bad fortnight and a day too noisy to show
  a trend.

### Next

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
