# BrandShift OS

Multi-tenant ERP + CRM + team-collaboration platform for BrandShift.

Slack's speed and shell, Odoo's breadth. Built so that no user is ever confused about where they
are or what to do next.

Status: **Phase 1 complete** -- data foundation, design system, app shell, authentication and
the first vertical slice. Phase 2 is next. See [ROADMAP.md](ROADMAP.md).

## Requirements

- Node 22+ (developed on Node 26)
- Docker with Compose v2+

## Run it

```bash
cp .env.example .env      # then set JWT_SECRET and the Postgres password
npm install
docker compose up -d db   # Postgres only
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:3000
```

Generate a `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

If something already holds port 5432 on this machine, set `DB_PORT` in `.env` to a free port
and point `DATABASE_URL` at it. The database is published on loopback only either way.

The seed prints its own sign-in table. Every demo account uses the password `brandshift`:

| Role | Email |
|---|---|
| owner | `amina.benali@brandshift.test` |
| admin | `tom.decker@brandshift.test` |
| manager | `elena.rossi@brandshift.test` |
| member | `lukas.weber@brandshift.test` |

Full stack in containers, reachable on the local network:

```bash
docker compose up -d --build
```

## Verify

```bash
npm run lint && npm run typecheck
npm run test              # unit: tenancy guard, colour contrast, message parity
npm run test:e2e          # end to end: auth, tasks, the wizard, responsive, axe
curl -s localhost:3000/api/health
```

The end-to-end suite builds the app, starts it on port 3100, and runs against its own
`brandshift_test` database, rebuilt from the seed each run -- so running it never touches the
data you were working with. It needs Postgres up (`docker compose up -d db`) and a browser the
first time (`npx playwright install chromium`).

See [KNOWN-GAPS.md](KNOWN-GAPS.md) for what is deliberately not covered.

To bring the previous app's data across, see [MIGRATION.md](MIGRATION.md).

`/api/health` answers 200 when the database is reachable and 503 when it is not; Compose uses it
as the app container's healthcheck.

## The app

`npm run dev`, then <http://localhost:3000> -- it redirects to `/en/today`. Every route is
locale-scoped: `/en/...` and `/fr/...`, both complete.

Sign in as any seeded person -- the password is `brandshift` for all of them:

| Role | Email | Rail |
|---|---|---|
| owner | `amina.benali@brandshift.test` | Today / Finance / Work / People / Inbox |
| admin | `tom.decker@brandshift.test` | Today / Finance / Work / People / Inbox |
| manager | `elena.rossi@brandshift.test` | Today / Work / People / Insights / Inbox |
| member | `lukas.weber@brandshift.test` | Today / My Work / Calendar / Inbox / Team |
| client services | `sofia.laurent@brandshift.test` | Today / Pipeline / Work / People / Inbox |

Signing in as a member and opening `/en/insights` directly shows the 403 page -- refused, but
still signed in. Signed-in devices and password change live under Settings.

What is built:

- **Today** -- a coordination queue (blocked / overdue / unassigned) for managers and above, and
  a Next Task panel plus Now / Next / Later for everyone else.
- **Work** -- the projects list, and each project as a routed page with Overview / Tasks / Team /
  Activity. Tasks default to a prioritised list; the board is behind a toggle.
- A task opens in a side drawer with Start, Complete and Report blocker. The open task is in the
  URL (`?task=<id>`), so it can be linked to and the back button closes it.
- **New project** -- five guided steps, with each person's current workload shown at the moment
  you assign them. Nothing is saved until you publish.
- **People** -- the directory, server-paginated and filtered through the URL; each person as a
  routed page with their workload, projects and activity; invites; role and module editing.
- **Inbox** -- what involves you: work you were given, a blocker on something you run, a change to
  what you may do. Never your own actions. The unread count on the rail is a real count of rows
  you can go and act on.
- **Channels** -- where the work gets talked about. Every project has one, nested under Work in
  the rail with its own unread badge. The feed interleaves what people said with what happened to
  the project, in the order it happened, so the conversation and its context read as one column.
  New messages arrive without a refresh, and the avatars at the top are whoever else has it open.

- **Calendar** -- meetings, task deadlines and project deadlines in one agenda, with a month grid
  behind a toggle. It owns nothing: every deadline is read off the task or project it belongs to,
  so nothing here can drift out of step with the thing it stands for. The whole view lives in the
  URL, so you can send someone a week.
- **Meetings** -- schedule one and see who is already booked *while you are picking them*, not
  after the invitation has gone out. Answer yes, no or maybe; write up what was decided. Moving a
  meeting withdraws everyone's answer, and cancelling one leaves it on the calendar saying so.

- **Time off** -- ask for leave and watch the working-day cost as you pick the dates; weekends
  cost nothing. Approvers get a queue, and nobody can sign off their own request. Balances are
  computed from what was actually approved rather than stored and hoped over. Approved time off
  appears on the calendar, and scheduling a meeting tells you somebody is *away* rather than merely
  *busy*.

- **Insights** -- what has gone wrong, first: projects at risk, and what has been stuck longest,
  every row a link to the thing you would open to fix it. Then whether the work is keeping up --
  tasks created against tasks completed, by week -- and what each person is carrying, meetings and
  time off included. Every number comes from a row somebody made by using the app. There is no
  productivity score, and there never will be.

- **Pipeline** -- companies, the people at them, and the work being sold. A list by default and a
  board behind a toggle, both addressable by URL. Losing a deal asks why, and the reason stays on
  the deal. Every deal gets a channel on the same spine a project does. The one figure on the
  screen is a sum of real values, never a weighted forecast.

- **Finance** -- quotes, invoices and expenses. Every amount is an integer number of cents from
  the moment it is typed to the moment it is shown, and tax is worked out per line rather than on
  the subtotal, because a document with design at 20% and print at 5.5% gives a different answer
  each way. Numbers are allocated under a lock and never reused; an issued invoice is voided, not
  deleted. Payments are recorded and the status follows the arithmetic. An accepted quote becomes
  a project with a task per line, which is the handover that used to be retyping.

- **Objectives** -- what the company is trying to do, and how it will know. An objective is a
  sentence; a key result is the number it is judged by; a checkpoint is somebody writing down what
  that number actually is, on a day, with their name on it. Progress is measured from the start
  rather than from zero, so 40 to 60 against a target of 100 reads as a third of the way. Nothing
  is stored that could be computed, and "nobody has measured this" is a state of its own rather
  than a zero. There is no company health score and there will not be one.

- **Procedures** -- how the work is done here, and when somebody last confirmed it still is.
  Each one has an owner, an ordered list of steps and a review interval; the screen opens with
  the ones that have gone stale, because a procedure nobody has checked in a year gives wrong
  instructions with the authority of being written down. Marking one reviewed is a single click,
  and it records who and when.

Press `Cmd+K` (or `Ctrl+K`) anywhere to jump to a screen, a project, a person or a department.

## Design system

`npm run dev`, then:

- <http://localhost:3000/design> -- tokens, read live from `src/app/tokens.css`, so its swatches
  and contrast ratios are the ones that actually ship
- <http://localhost:3000/design/primitives> -- every control in every state

Primitives live in `src/components/ui/`, built on Base UI and styled only with semantic tokens.

Components name semantic tokens (`bg-surface-raised`, `text-fg-muted`, `bg-accent`), never
primitives and never a raw hex. `src/app/tokens.test.ts` resolves every semantic token through
its `var()` chain in both themes and fails the build if any pair drops below WCAG AA -- 4.5:1
for text, 3:1 for control edges and focus rings -- or if a type token falls under 12px.

## Tenancy

Every tenant-owned table carries `organization_id`, and `withOrg()` in `src/db/tenancy.ts` is the
only sanctioned way to query one. Auth is custom, so Postgres row-level security is not in play
and the rule is enforced in application code instead -- which is safe only because it is enforced
in exactly one place. `src/db/tenancy.test.ts` fails the build if a tenant table is touched from
outside `src/db`, or if a new table gains `organization_id` without being either scoped or
explicitly exempted with a reason.

## Documentation

- [CLAUDE.md](CLAUDE.md) -- stack, conventions, and the design rules that are not negotiable
- [KNOWN-GAPS.md](KNOWN-GAPS.md) -- what is deliberately unfinished, unverified, or accepted
- [DECISIONS.md](DECISIONS.md) -- what was decided, and why
- [ROADMAP.md](ROADMAP.md) -- what is done and what is next
- [MIGRATION.md](MIGRATION.md) -- bringing the previous app's data across

## Relationship to the previous app

This replaces `abdelterminal/brandshiftsaas` (Angular + Django + MongoDB). That project is
untouched and still runs; it stays the system of record until you decide otherwise.

Its data comes across with `npm run db:migrate:mongo`, which reads Mongo, prints everything it can
and cannot carry, and writes nothing unless you pass `--commit`. It reads only, applies in one
transaction, and can be run as often as you like -- every row lands on an id derived from its Mongo
`_id`, so a second run updates what the first one wrote.

Nobody has to reset a password: the old app's Django hashes are read as they are and upgraded to
scrypt on first sign-in.

**[MIGRATION.md](MIGRATION.md)** is the runbook -- what arrives, what deliberately does not, and
the decisions the script makes on your behalf.
