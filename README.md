# BrandShift OS

Multi-tenant ERP + CRM + team-collaboration platform for BrandShift.

Slack's speed and shell, Odoo's breadth. Built so that no user is ever confused about where they
are or what to do next.

Status: **Phase 1, milestone 2** -- data foundation done; design tokens and type scale
awaiting sign-off. See [ROADMAP.md](ROADMAP.md).

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

## Design system

`npm run dev`, then <http://localhost:3000/design>. The reference page is read live from
`src/app/tokens.css`, so its swatches and contrast ratios are the ones that actually ship.

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
