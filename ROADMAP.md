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

### CRM  [DONE]

- [x] `companies` / `contacts` / `deals`, all tenant-owned. A contact is deliberately **not** a
      `users` row: somebody you talk to, not somebody who signs in
- [x] Pipeline as a **list by default, board behind a toggle** -- the same call and the same reason
      as tasks. Every choice in the URL, as on the calendar
- [x] Six stages and no more. Every CRM that grows a tenth grows it because somebody wanted a
      report, and then nobody can remember what two of them mean
- [x] **Losing a deal asks why**, and the reason lives on the deal rather than only in the feed.
      A pipeline with no reasons on the lost deals teaches nobody anything once the quarter is over
- [x] Money is `numeric` end to end, parsed once at the edge. The form takes `12 500` and `12,000`
      and refuses `about forty thousand` rather than storing a zero
- [x] **Deal channels**, on the same spine as project channels -- `channel_kind` has named `deal`
      since channels shipped, waiting for this
- [x] A **third rail for client services**: Today / Pipeline / Work / People / Inbox. Five, so the
      cap holds; Insights moves to the palette for them
- [x] A fourth e2e role, because the manager fixture runs engineering and does not hold `crm` --
      the suite now has somebody who can see the pipeline and somebody who cannot
- [x] Seeded: seven companies, ten contacts, eight deals across every stage including two lost
      with their reasons

Decisions worth knowing:
- **No weighted forecast.** The one figure on the screen is a sum of real numbers on real deals.
  Multiplying each stage by a probability somebody invented looks more sophisticated and produces a
  number nobody can check.
- **No separate CRM activity log.** Everything already writes to `activity_events`, and a deal has a
  channel. A second timeline for "calls and emails" would be a second place to look.
- **The board does not drag.** A drag has no keyboard equivalent and no confirmation, and moving a
  deal to Lost has to ask why -- which a drop cannot. Stages change on the deal.
- Company status is stored, not derived from whether a deal was won: a client of ten years may have
  no open deal, and a deal won in 2019 does not make a current client.

### ERP  [DONE]

- [x] `quotes` / `quote_lines` / `invoices` / `invoice_lines` / `expenses`, all tenant-owned,
      every amount an integer number of cents from the parse to the format
- [x] `src/lib/money.ts` -- the arithmetic, on its own, with 18 tests. Quantities in thousandths
      because agencies bill in eighths of a day; tax in basis points because 5.5% is a real French
      rate; rounding **half away from zero**, which is what a tax authority specifies and what
      `Math.round` does not do to a credit
- [x] **Tax per line, not on the subtotal.** Design at 20% and print at 5.5% give a different
      answer each way, and per line is the one that is correct
- [x] Document numbers -- `Q-2026-0001`, `INV-2026-0001` -- allocated with `SELECT ... FOR UPDATE`
      inside the same transaction that writes the document, behind a unique index that would refuse
      a duplicate anyway
- [x] Totals are **stored on the document**, deliberately the opposite of leave balances. A balance
      is a fact about the present and is computed; an invoice is a record of what was sent, and
      what it said is what it said
- [x] A **quote becomes a project**: each accepted line becomes a task, which is the handover
      `KNOWN-GAPS` had flagged as retyping since CRM
- [x] Payments are recorded against an invoice and the status follows the arithmetic --
      `part_paid` until the sum reaches the total, then `paid`. Nobody sets it by hand
- [x] An issued invoice is **voided, never deleted**. A number that was sent to a client does not
      get reused
- [x] A **fourth rail**, for whoever holds `finance`: Today / Finance / Work / People / Inbox.
      `finance` is read before `crm` because the owner and the operations lead hold both, and it
      is the narrower statement of the two about what somebody's day actually is
- [x] A fifth e2e role holding the `finance` module, and 23 specs including the axe and responsive
      sweeps on all six routes
- [x] Seeded: six quotes, six invoices and six expenses across every status

Decisions worth knowing:
- **No `orders` table.** For an agency the confirmed engagement is an accepted quote plus the
  project the work becomes. A third entity between the deal and the project is a table nobody
  fills in and a status nobody keeps current.
- **The line editor does its arithmetic with the same functions the server does.** The running
  total under the form is not a second implementation that can disagree with the one that is
  stored; it is `totalsFor` in the browser and `totalsFor` again in the transaction.
- **A form field never reads as zero.** `parseMoney` takes `12 500`, `12,500` and `1 234,56`, and
  refuses `about forty thousand` with a message rather than storing nothing.
- Expenses are money out with a category and a receipt reference, reimbursed or not. They are not
  a purchase-order workflow, and there is no approval chain on them.

### Data migration from the old MongoDB app  [DONE]

- [x] `src/db/migrate/` -- `map.ts` is the whole translation and is pure, so it is unit-tested
      without a Mongo to read or a Postgres to write. 31 tests, every case taken from profiling
      the real `mediast_db`
- [x] **Dry run by default.** It reads, works out every row it would write, prints what it can and
      cannot carry, and stops. `--commit` is a deliberate act
- [x] **One transaction.** Either the whole migration lands or the database is untouched
- [x] **Re-runnable.** Every row lands on a UUID v5 derived from its Mongo `_id`, so a second run
      updates what the first wrote. A migration you can only run once is a migration you cannot
      rehearse
- [x] **Reads only, and prefers a secondary.** The old app stays the system of record
- [x] **Nobody has to reset a password.** The old app stored Django `pbkdf2_sha256`; `verifyPassword`
      now reads it and the first sign-in re-hashes to scrypt. Tested against a vector generated by
      the old app's own Django rather than from memory
- [x] The report names **everything it could not carry, and why** -- sessions, attendance, lunch
      records, DMs, budgets, durations, tags, task progress, department images
- [x] Rehearsed against a **copy of the real volume**: 7 people, 5 departments, 17 companies, 40
      projects, 158 tasks, 202 activity events. Run twice, unchanged. Signed in as a migrated
      account in a real browser and watched the hash turn into scrypt
- [x] `MIGRATION.md` -- the runbook, the decisions, and the table of what does not come across

Decisions worth knowing:
- **The free-text `client` on a project becomes a CRM company.** Eighteen distinct strings became
  seventeen companies, because `"Obarfum "` and `"Ô Bar'Fum"` are one client typed twice. They are
  grouped by a fold of the name -- case, accents, and non-alphanumerics removed -- which is not
  fuzzy matching, and **every merge is printed by name** so a person can see each decision.
- **Nobody is promoted.** `ADMIN` becomes `admin`, `EMPLOYEE` becomes `member`, and no one becomes
  a `manager`. The old schema records nothing that would justify the middle tier.
- **The earliest ADMIN becomes the owner**, and if there is no ADMIN the run refuses rather than
  choosing one.
- **Project keys are generated from initials** -- `Mr Dyaf - Filmmaking` is `MDF`. The format
  forbids digits, so collisions take more letters from the name before falling back to a suffix.
- **An ambiguous owner is left empty.** The old `owner` is a typed first name; it resolves only
  when exactly one person answers to it.


## Phase 3 -- from the Notion workspace

`Mediast OS` in Notion is the operating system this app is replacing. Its hub page names ten
areas; five of them are already built here (Projects, Tasks, Team, Clients, CRM Commercial) and
`Mediast HQ` is roughly Today plus Insights. The remaining four are genuinely new, and this is
them, in the order they are worth building.

The export was only the hub page -- the ten sub-pages are link-to-page blocks pointing elsewhere
and did not come across, so these are built from the structure. **The content of each area still
has to come from Notion**, and none of it has been invented here.

### Objectives & KPI  [DONE]

- [x] `objectives` / `key_results` / `key_result_checkpoints`. An objective is a sentence, a key
      result is the number it is judged by, and a checkpoint is somebody writing down what that
      number actually is on a given day
- [x] **Progress is never stored.** It is computed from the latest checkpoint against the start
      and the target, and health -- on track, at risk, behind -- from that against elapsed time.
      The same call as leave balances, and the opposite of invoice totals
- [x] **Measured from the start, not from zero.** 40 to 60 against a target of 100 is a third of
      the way, not 60%. The e2e asserts `aria-valuenow="50"` on a seeded key result that a naive
      implementation would report as 70
- [x] **"Not measured" is a state of its own**, distinct from zero, everywhere -- in the model, on
      the screen, and in what a screen reader is told (`aria-valuenow` is omitted, not set to 0)
- [x] Values are integers in the scale their unit defines -- cents, basis points, thousandths --
      reusing `money.ts` rather than inventing a second numeric representation. 28 unit tests
- [x] Closing an objective is deliberate and asks how it went, in words as well as an outcome.
      It can be undone
- [x] Open to everyone to read, manager-or-`insights` to set, **anyone to measure**
- [x] Seeded in three states on purpose: on track, slipped, and never measured

Decisions worth knowing:
- **No weighting.** An objective's progress is the plain mean of its key results. Weights are a
  number somebody invents in a meeting and never revisits, and they make the headline figure
  impossible to check by eye. If one key result matters more, it should be its own objective.
- **Unmeasured key results are left out of the mean, not counted as zero.** Counting them as zero
  makes an objective look like it is failing when the truth is that nobody has looked.
- **No company health score.** A single number blending unrelated goals is the definition of an
  invented metric, which the design rules forbid. Insights gets counts of real objectives in real
  states instead.
- **Health bands are forgiving on purpose.** Work does not arrive linearly -- a campaign lands in
  one week and moves a quarter's number -- so nothing is called `behind` until it is a long way
  adrift. A screen that shouts every Tuesday stops being read.
- **Not on any rail.** Five is the cap and every rail is full. Objectives is in the palette and
  the More menu; direction is something people look at deliberately, weekly at most.

### SOP Library  [DONE]

- [x] `sops` / `sop_steps`. A procedure is an owner, a summary, an ordered list of steps, and
      the date somebody last confirmed it is still right
- [x] **The screen leads with what has gone stale.** That is the only thing on it costing
      anybody anything: a procedure nobody has checked in a year does not sit there harmlessly,
      it tells people to do the wrong thing with the authority of being written down
- [x] **"Never reviewed" and "overdue" are different states**, ranked differently, because they
      are different problems with different fixes
- [x] `reviewDueOn` is computed from the last review plus the interval, never stored -- the
      third time this app has made that call, after leave balances and objective health
- [x] Steps are **rows, not prose**: no Markdown parser, no HTML-injection surface on text
      several people edit, and something for Templates to turn into tasks
- [x] Reviewing is **one click, no dialog**. The owner may review their own procedure whatever
      their role
- [x] Retired procedures are kept, not deleted -- "we used to do it this way" is a fact people
      need to point at
- [x] 23 unit tests on the review arithmetic and the ordering; 7 e2e specs
- [x] Seeded in all four review states on purpose, including one badly overdue and one never
      checked

Decisions worth knowing:
- **A review is one click.** No second signature, no approval flow. A six-month check that costs
  a form is a check nobody does, and then every procedure in the library is permanently overdue
  and the queue becomes noise.
- **Steps rather than a document body.** A procedure *is* an ordered list of things somebody
  does. Modelling it as one costs nothing, renders with no dependency, and gives Templates a
  step to turn into a task exactly as a quote line already becomes one.
- **Six months by default** -- long enough not to be busywork, short enough that a procedure
  cannot quietly outlive the way the work is actually done.
- **Amber, not red**, for an overdue review. Red is for blocked, overdue *work*, destructive
  actions and the primary action.

### Templates  [DONE]

- [x] `project_templates` / `template_tasks`. A template is the shape of a job worth doing the
      same way twice: the tasks, in order, each with the day of the project it falls due
- [x] **`offsetDays` is the whole point.** A template carries a *schedule*, not just a list --
      "kickoff on day zero, first cut on day fourteen, delivery on day thirty" is the part nobody
      reconstructs from memory, and the part that puts real deadlines on a real calendar the
      moment a project is created
- [x] **Blank means no deadline**, and stays that way through the round trip. Plenty of work in
      a project genuinely has no date, and anything that is not a whole number of days is refused
      rather than read as day zero
- [x] **A procedure becomes a template** -- the link the SOP milestone was built to make possible.
      Steps come across in order; no schedule is invented on their behalf
- [x] **A project that went well becomes a template**, keeping its shape rather than its calendar:
      each deadline is measured back into an offset from the start date
- [x] Starting a project is one transaction covering the project, its first member and every
      task -- the same shape as `createProjectFromQuote`, which it deliberately mirrors
- [x] 28 unit tests on the date arithmetic, 8 e2e specs, seeded with one scheduled template and
      one with no dates at all

Decisions worth knowing:
- **No default assignee on a template task.** A template outlives the people in it: the person
  who always did the edit leaves, and every project started afterwards quietly assigns work to
  somebody who is gone. Assigning is a decision made per project, with the real team's workload
  in front of you -- which is what the project wizard already exists to show.
- **Offsets are calendar days, not working days.** A template that says day thirty means thirty
  days. Turning that into six working weeks would surprise whoever wrote it; the weekend rule
  belongs to leave, where somebody's allowance is actually being spent.
- **The project's own deadline is its last task's**, which is what the template said the job
  takes.
- **Starting a project needs `project.create`, not `template.manage`.** Reading a template and
  running a job from it is not the same privilege as deciding what the template says.

### Next

- **Weekly Reviews** -- a recorded ritual rather than a screen you happen to look at. Insights and
  Objectives already hold everything one would read out; what is missing is the record of what was
  said and decided.

Still true, and still the largest single gap: **a mail transport**. Invites, notifications,
invoice sending and password resets all wait on it.

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
