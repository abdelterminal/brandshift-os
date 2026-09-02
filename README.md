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
npm run test              # includes the tenancy guard
npx playwright test
curl -s localhost:3000/api/health
```

`/api/health` answers 200 when the database is reachable and 503 when it is not; Compose uses it
as the app container's healthcheck.

## The app

`npm run dev`, then <http://localhost:3000> -- it redirects to `/en/today`. Every route is
locale-scoped: `/en/...` and `/fr/...`, both complete.

Sign in as any seeded person -- the password is `brandshift` for all of them:

| Role | Email | Rail |
|---|---|---|
| owner | `amina.benali@brandshift.test` | Today / Work / People / Insights / Inbox |
| admin | `tom.decker@brandshift.test` | Today / Work / People / Insights / Inbox |
| manager | `elena.rossi@brandshift.test` | Today / Work / People / Insights / Inbox |
| member | `lukas.weber@brandshift.test` | Today / My Work / Calendar / Inbox / Team |

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

Press `Cmd+K` (or `Ctrl+K`) anywhere to jump to a project, a person or a department.

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
- [DECISIONS.md](DECISIONS.md) -- what was decided, and why
- [ROADMAP.md](ROADMAP.md) -- what is done and what is next

## Relationship to the previous app

This replaces `abdelterminal/brandshiftsaas` (Angular + Django + MongoDB). That project is
untouched, still runs, and remains the system of record until this one reaches parity. There is
no data migration yet -- see Phase 2 in the roadmap.
