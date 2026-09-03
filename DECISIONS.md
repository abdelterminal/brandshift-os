# Decisions

Locked choices and why. Revisit deliberately, not by accident.

Date established: 2 September 2026.

## Product

**BrandShift OS is a multi-tenant SaaS with an ERP side and a CRM side.**
Inspiration: Slack's speed, shell and sense of place; Odoo's module breadth.
The success criterion is not feature count -- it is that no user is ever confused about where
they are or what to do next.

## Locked

| Decision | Choice | Why |
|---|---|---|
| Stack | Next.js 16 + PostgreSQL 17 | The previous Angular + Django + MongoEngine stack could not reach the target UX without a rewrite of tenancy, permissions, and the embedded-task schema anyway. Postgres suits relational ERP/CRM data; MongoDB did not. |
| Database & auth | Self-hosted Postgres in Docker, custom JWT | Everything stays on the local network. No cloud dependency, no monthly cost, no vendor auth lock-in. |
| Deployment | Docker Compose on the LAN only | Same operating model as the previous app. Not Vercel. |
| Data | Fresh start with realistic seed data | Lets the schema be designed correctly for ERP/CRM instead of inheriting Mongo document shapes. The old app keeps its data and stays the system of record until Phase 2 parity. |
| Tenancy | Multi-tenant from day one | Every tenant-owned table carries `organization_id`. Costs ~10% more effort now and zero later; retrofitting tenancy means touching every table, query and screen. |
| Roles | Named roles + per-module permissions | `owner \| admin \| manager \| member` plus module flags (`finance`, `people`, `crm`, `insights`). The old app's binary ADMIN/EMPLOYEE cannot express "can see salaries" or "can issue invoices". Odoo's model, minus the complexity of a full custom role builder. |
| Language | English + French, both complete | Actual users work in French. Both locales ship together per screen; no half-translated states. |
| Slack DNA | Shell + command palette now, channels later | The left rail, instant switching and Cmd+K deliver most of the "feels like Slack" sensation at low risk. The channel/thread model is a real-time platform build and waits for Phase 2 -- but `activity_events` is designed now as the feed spine it will attach to. |
| Theme | Light and dark equal, one token set | Dense ERP/CRM tables need light; the brand's character wants dark. One token set means neither is a retrofit. |
| Phase 1 | Foundation + one vertical slice | Foundation, shell, auth, then People and Work fully built. Attendance, Meetings, Inbox, Insights, CRM and ERP follow against a proven base rather than being designed blind. |
| Repo | `abdelterminal/brandshift-os`, private, new app only | Clean history. The old repo `abdelterminal/brandshiftsaas` stays where it is, untouched and still running. |

## Carried forward from the old project

Design direction, brand rules and information architecture come from the audit recorded in
`BRANDSHIFT_UX_REDESIGN_HANDOFF.md` in the previous repo. The substance is distilled into
`CLAUDE.md`; that file is now the source of truth and the old document is history.

Two findings from the old `ARCHITECTURE.md` are fixed by construction here rather than deferred:

1. **JWT in `localStorage`** was listed as architectural priority #2. Now an HttpOnly cookie plus
   a server-side session digest, from the first commit.
2. **Tasks embedded in the project document** was flagged as a document-growth and write-contention
   risk. `tasks` is a first-class table here.

## Added during M4 (authentication)

**The `sessions` digest check runs in the page, not the middleware.**
The roadmap said "digest check in middleware". Doing that literally means a database round trip
-- and a second connection pool -- in front of every request, including static assets, which is a
bad trade for a self-hosted app. Instead the middleware verifies the JWT's signature and expiry
(no database, no Node-only crypto) and uses that to route; `requireUser()` does the full check --
digest, revocation, expiry, password-change invalidation -- and the `(app)` layout calls it on
every render. A revoked session therefore still cannot see a single page. The middleware is a
routing decision; the page is the security boundary. The only practical difference is one wasted
redirect for a cookie that is signed but no longer live.

**Only a digest of the token's `jti` is stored.** The cookie holds an HS256 JWT carrying a random
32-byte `jti`; `sessions.token_digest` holds SHA-256 of it. A leaked database yields nothing
replayable as a cookie. The signature proves we issued the token; the digest lookup proves the
session is still live. Both are required, which is the whole reason the table exists rather than
trusting the JWT alone.

**Changing a password invalidates every other session without a sweep.** `getCurrentUser()`
refuses any session row created before `users.password_changed_at`, so one column does the work of
a bulk update. The device doing the change is re-issued, so nobody signs themselves out of the
browser they are sitting in front of.

**403 never costs you your session.** `unauthorized()` clears the cookie; `forbidden()` touches
nothing. The old app signed people out on a permission error, which lost whatever they were in the
middle of and taught them that clicking the wrong link is expensive.

## Added during Channels

**Postgres is the message bus.** A write calls `pg_notify`; one `LISTEN` connection per process
fans it out to browsers over Server-Sent Events. The alternative was Redis or a websocket gateway,
and this deploys as one Next container and one Postgres on a local network -- every extra service
is another thing that can be down at 9am on a Monday. Postgres was already required, already
running, and already where the write went.

**SSE, not websockets.** The traffic is one-way: the server says "this channel changed" and the
browser refetches through the same server components a page load uses. That means there is no
second client-side rendering path for a message, so a live update and a refresh cannot show
different things -- which is the usual way a live feed starts disagreeing with the page it is on.
It costs one round trip per change.

**Presence is derived from open connections, not written down.** A browser with the channel open
holds a socket; when the tab closes, the socket closes and the avatar goes. There is no heartbeat
table, nothing to expire, and nothing to clean up after a crash, because the evidence and the fact
are the same thing. The cost is that presence is per process -- recorded in `KNOWN-GAPS.md`.

**A message is not a notification.** Unread state belongs to the channel and shows as a badge on
the rail; the inbox stays for the handful of things that need one specific person. Copying every
message into the inbox would produce two queues saying the same thing, and people would read
neither. Mentions are the thing that will change this, and will be the reason to.

**A project channel is the project's history with talk in it.** The feed interleaves
`activity_events` and `messages` in one column rather than putting chat in a tab beside the
activity log. This is what `activity_events` was designed as a spine for. Long runs of routine
activity fold to a count so the column still reads as a conversation; blockers, status changes and
role changes are never folded.

**One home per channel.** Everything lives at `/channels/<slug>`. `/work/<key>/channel` creates
the channel if the project predates channels and forwards there, so a link followed from a project
and a link pasted into a message are the same URL.

## Added during Calendar and Meetings

**The calendar owns no rows of its own.** Meetings are a real table; everything else on the screen
-- task deadlines, project deadlines -- is read where it already lives. The alternative is an
`events` table that a deadline is copied into, which disagrees with the task the first time
somebody moves a date and then needs two edits for every change. It also means the rule "no
invented dashboard metrics" holds here by construction: there is nothing on this screen that is
not a row somebody can open.

**A list before a grid.** The agenda is the default and the month grid is behind a toggle, for the
same reason lists come before boards for tasks: a list answers "what have I got on" and a grid
answers "what shape is my month", and people arrive with the first question.

**The whole view is in the URL.** Which week, whose calendar, week or month, agenda or grid. A
calendar you cannot send to somebody is one people describe to each other instead.

**Times are the organization's clock, and the offset is measured.** A `datetime-local` input
carries no zone. Somebody typing 14:30 means half past two in the studio, wherever they happen to
be sitting. Paris is +01:00 in January and +02:00 in July, so the offset is computed at the
instant in question rather than assumed once.

**`can()` takes a resource, and meetings are the first rule to use it.** Whether you may move a
meeting depends on who called it. The signature has carried the argument since M3 for exactly this;
the alternative -- an `isOrganizer` check written into each action -- is the second place
permission rules live, which is the thing `authz.ts` exists to prevent.

**Rescheduling withdraws every answer.** A yes was a yes to a time. Carrying it across to a
different one puts people in a meeting they never agreed to, and the organizer would not know.

## Added during Attendance and leave

**Attendance is who is in, not a timeclock.** The roadmap line said "attendance and leave"; a
studio of twelve salaried people does not clock in and out, and building that would have produced a
feature nobody would use next to a number nobody would trust. What people actually need is to know
who is away, which falls out of leave for nothing. Billable-hours timesheets are a real want, but
they belong beside ERP invoicing rather than here.

**A balance is computed, never stored.** Allowance minus approved annual days in the year, worked
out when somebody looks. A stored balance has to be kept in step with the requests behind it, and
the first time an approval is withdrawn it is wrong with nothing to say so. The same reason the
calendar owns no rows of its own.

**Only annual leave spends the allowance.** Sick leave is not a budget people are given to spend,
and presenting it as one is how a company teaches its staff to come in ill.

**Nobody signs off their own request.** Written twice on purpose -- `can("leave.approve", request)`
keeps the buttons off the screen, and the update statement filters on it as well, so a crafted
request changes nothing rather than being caught by the UI alone.

**Time off shows on the calendar, not on a calendar of its own.** The time-off screen is for asking
and deciding. Where somebody is on a given day is a calendar question, and the calendar already
exists.

## Added during Insights

**No productivity metric, anywhere.** The obvious thing to put on a reporting screen is tasks
completed per person, and it is the one number this app will not show. A count of tasks is not a
count of value -- a person who closed nine small things did not do more than the person who closed
one hard one -- and beside somebody's name it stops being a planning tool and becomes a scoreboard.
The load table answers "what is this person carrying", which is the question a coordinator actually
has.

**Created against completed, never either alone.** A completion count with nothing to compare it to
is a vanity total, which the design rules already forbid. The pair says whether the queue is
growing, which is the thing worth knowing before it becomes obvious in the diary.

**Exceptions before trends.** The page opens with what has gone wrong, ranked, each row a link to
the thing you would open to fix it. The chart is underneath. A screen that opens with a chart is a
screen people look at once a month.

**A table with bars, not a charting library.** The numbers are the point and a table states them
exactly; a screen reader gets a real table rather than an SVG it has to be told about; and a chart
dependency is a decision that costs more than a handful of divs with a width class on them.

## Added during CRM

**A contact is not a user.** Somebody you talk to has no password, no membership and no session.
Conflating the two is how a CRM ends up able to email its own staff by accident, and how a
directory of colleagues fills up with people at other companies.

**No weighted pipeline.** The only figure on the screen is a sum of real values on real deals.
Multiplying each stage by a probability -- 20% for a lead, 60% for a proposal -- produces a number
that looks more sophisticated and that nobody can check or argue with. It is the same rule as "no
invented dashboard metrics", applied to money.

**Six stages, and the list is closed.** Every CRM that grows a tenth stage grows it because
somebody wanted a report, and then nobody can remember what the difference between two of them is.

**The board is read-only.** A drag has no keyboard equivalent, no confirmation, and nowhere to put
a question -- and moving a deal to Lost has to ask why. Stages change on the deal itself, which is
also where the answer is recorded.

**A third rail, rather than a sixth destination.** The cap of five is what keeps the rail
scannable, and it was not bent: somebody holding the `crm` module gets Pipeline where a coordinator
gets Insights. This is the same reasoning that already gives coordinators and members different
rails -- two different jobs, not one job with things hidden. Without it, the person who lives in
the pipeline was the only person who could reach it solely by name in the command palette.

**Money is `numeric` from the column to the screen.** Parsed once at the edge, stored as an exact
decimal, and never allowed to become a float. This is the column ERP will invoice against, and a
float that has been through a sum is a rounding error waiting for a customer to find it.

## Deliberately not chosen

- **Supabase / managed Postgres** -- would have given Realtime and RLS for free, but the
  requirement is that everything runs on the local network.
- **Restyling the existing Angular app** -- cheaper, but tenancy, permissions and the task schema
  all block the target UX.
- **A full custom role builder** -- a whole feature area and easy to make confusing. Named roles
  plus module flags cover the real cases. Revisit if a customer actually asks.
- **Postgres row-level security** -- auth is custom, so tenancy is enforced in app code via
  `withOrg()`. Accepted risk; the guardrail is that no raw query on a tenant table is permitted.
