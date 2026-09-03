# BrandShift OS

Multi-tenant ERP + CRM + team-collaboration platform. Slack's speed and shell, Odoo's breadth,
BrandShift's brand. The guiding constraint on every decision: **a user must never feel lost.**

Read `DECISIONS.md` before proposing anything that contradicts a locked choice.
Read `ROADMAP.md` to find out what to work on next.
Read `MIGRATION.md` before touching anything that moves data in from the previous app.
Read `KNOWN-GAPS.md` for what is deliberately unfinished or unverified, and **update it in the
same commit as the work** -- add a row when something is deferred, delete the row when it is
closed. A caveat repeated at the end of every milestone and written down nowhere is a caveat
nobody ever acts on.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI, not Radix), Lucide icons |
| Database | PostgreSQL 17, self-hosted in Docker |
| ORM | Drizzle + `node-postgres`, migrations via `drizzle-kit` |
| Auth | Custom HS256 JWT (`jose`) in an HttpOnly cookie + server-side `sessions` table |
| i18n | `next-intl` -- `en` and `fr`, both complete |
| Validation | Zod at every input boundary |
| Tests | Vitest (unit) + Playwright (e2e) |
| Deploy | Docker Compose on the local network. Not Vercel. |

## Commands

```bash
npm run dev              # dev server
npm run build            # production build (standalone output)
npm run lint             # eslint
npx tsc --noEmit         # type check
npm run test             # vitest -- unit, tenancy guard, contrast, message parity
npm run test:e2e         # playwright -- five roles: anonymous, member, manager, client services, finance
npm run test:e2e:ui      # the same, with the Playwright UI
npm run db:generate      # drizzle-kit generate  (after editing src/db/schema)
npm run db:migrate       # apply migrations
npm run db:seed          # load demo data
npm run db:migrate:mongo # bring the old app's data across (dry run without --commit)
docker compose up -d --build
```

## Conventions

- `src/app/[locale]/` -- all routes are locale-scoped. `(auth)` and `(app)` route groups.
- `src/db/schema/` -- one file per domain area, re-exported from `index.ts`.
- `src/lib/authz.ts` -- the **only** place permission rules live. UI visibility and Server Action
  enforcement both call `can()`, so a hidden button and a refused action can never disagree.
- `src/db/tenancy.ts` -- `withOrg()` is the only sanctioned way to query a tenant-owned table.
- Server Actions own all mutations; components stay presentational.
- Every user-facing string goes through `next-intl`. Write `en` **and** `fr` in the same pass.

## Design rules (non-negotiable)

Derived from the audit of the previous app, which scored 4.8/10 on usability. These rules exist
because each one is a mistake we already made once.

**Color**
- `#FD0000` is the brand red. It may occupy **<=5%** of any screen.
- Red is reserved for: primary action, active nav, destructive action, blocked/overdue.
  It never means anything else.
- Green = complete. Amber = due soon / needs attention. Blue = active / in progress.
- Charcoal surfaces, never pure black. Light and dark are equal citizens from one token set.

**Type & space**
- Space Grotesk for display headings, Inter for UI and body. Both self-hosted.
- Body text 14-16px. **Nothing essential below 12px.**
- Radii: 8px controls, 12px cards, 16px dialogs/drawers.
- Transitions 120-180ms, opacity and color only. Respect `prefers-reduced-motion`.

**Structure**
- Max 5 primary destinations in the sidebar per role.
- Profile and Settings live **only** in the avatar menu -- never also in the sidebar.
- Details and editing use **routed pages and side drawers**, never stacked modals.
- Lists before boards. Kanban is always a secondary view.
- Screens lead with next actions and exceptions, never with vanity totals.

**Never do this** (each one is a real finding from the old app)
- NO raw hex value in a component. Use a token. *(The old app had ~1,082.)*
- NO inline `style` attribute. *(The old app had 266.)*
- NO text below 12px that carries meaning. *(The old app had 184 instances.)*
- NO modal opened from a modal.
- NO password prompt to perform a routine write. Re-auth is for destructive/sensitive
  actions only, and stays valid for a short window afterwards.
- NO decorative uppercase micro-eyebrow above a heading.
- NO interactive element without hover, focus-visible, active, disabled and loading states.
- NO tenant-owned query that doesn't go through `withOrg()`.
- NO invented dashboard metrics. If the data isn't real, the widget doesn't ship.

## Definition of done for any screen

Both themes - both locales - 320/375/768/1024/1440px - keyboard-only navigable -
axe clean - empty, loading and error states all designed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
