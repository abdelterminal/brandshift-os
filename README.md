# BrandShift OS

Multi-tenant ERP + CRM + team-collaboration platform for BrandShift.

Slack's speed and shell, Odoo's breadth. Built so that no user is ever confused about where they
are or what to do next.

Status: **Phase 1, milestone 0 complete.** See [ROADMAP.md](ROADMAP.md).

## Requirements

- Node 22+ (developed on Node 26)
- Docker with Compose v2+

## Run it

```bash
cp .env.example .env      # then set JWT_SECRET and the Postgres password
docker compose up -d      # Postgres
npm install
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:3000
```

Full stack in containers, reachable on the local network:

```bash
docker compose up -d --build
```

## Verify

```bash
npm run lint && npx tsc --noEmit
npm run test
npx playwright test
```

## Documentation

- [CLAUDE.md](CLAUDE.md) -- stack, conventions, and the design rules that are not negotiable
- [DECISIONS.md](DECISIONS.md) -- what was decided, and why
- [ROADMAP.md](ROADMAP.md) -- what is done and what is next

## Relationship to the previous app

This replaces `abdelterminal/brandshiftsaas` (Angular + Django + MongoDB). That project is
untouched, still runs, and remains the system of record until this one reaches parity. There is
no data migration yet -- see Phase 2 in the roadmap.
