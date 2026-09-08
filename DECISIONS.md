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

## Added during ERP

**Integer cents, from the parse to the format.** Every amount is a whole number of minor units the
moment it leaves the input and stays one until it is formatted for the screen. Nothing in between
touches a float. `0.1 + 0.2` is `0.30000000000000004`, and an invoice is a column of numbers added
up and then multiplied by a tax rate -- a float that has been through that is a rounding error
waiting for a client to find it. `numeric` in the database, an exact decimal string on the wire,
`Cents` in the code.

**Tax is computed per line and then added, never applied to the subtotal.** A document with design
at 20% and print at 5.5% gives a different total each way, and per line is the one that is correct.
The consequence is worth stating: a hundred lines at 7 cents plus 20% comes to 100 cents of tax,
which is not 20% of 700. That is not drift -- it is what adding up line by line means, and it is
what the client's own accountant will do.

**Round half away from zero.** `Math.round` rounds half *up*, which sends -0.5 to 0 and makes a
credit note disagree with the invoice it reverses. Tax authorities specify away from zero; so does
`roundHalfAwayFromZero`, and it is the only rounding in the app.

**An invoice stores its totals. A leave balance does not.** These look like the same decision made
two different ways, and they are not. A balance is a fact about the present: it is whatever the
approved requests currently add up to, and storing it invites the stored number and the rows to
disagree. An invoice is a *document*: once it has been sent, what it said is what it said, and
recomputing it next year against a changed tax rate would silently rewrite history.

**Numbers are allocated with `SELECT ... FOR UPDATE` inside the writing transaction.** Two people
clicking Create at the same second must not both get `INV-2026-0007`. The lock does the work and a
unique index sits behind it, so the worst case is a refused write rather than a duplicate.

**An issued invoice is voided, never deleted.** A number that went to a client cannot be reused and
the document cannot vanish. Void is a status, it keeps the row, and it says who did it.

**A fourth rail, and `finance` outranks `crm` on it.** Finance shipped as a route, a permission
and a palette entry, and for one commit the only way to reach it was to know its name -- exactly
the fault the sales rail had been added to fix a milestone earlier. It landed hardest on the two
people who hold both flags, the owner and the operations lead, because the pipeline rail had
already claimed them. So a module still decides before the role does, and `finance` is now read
first: `crm` ends up on every manager who has been near a client, where `finance` is only ever
given to the people who send the invoices. The cap of five was not bent -- Finance takes the slot
Insights holds on the coordination rail, and Insights stays one keystroke away in the palette.

**No `orders` table.** The roadmap said quotes, orders, invoices, expenses. For an agency the
confirmed engagement is already an accepted quote plus the project the work becomes; a third entity
between the deal and the project is a table nobody fills in and a status nobody keeps current.
What was built instead is the quote-to-project handover, which is the thing that was actually
missing. Revisit if a customer sells anything that is not a project.

**The running total in the form is the same function as the stored one.** `totalsFor` runs in the
browser under the line editor and again inside the transaction. A second implementation for the
preview is a second implementation that can disagree with the invoice.

## Added during the data migration

**Nobody resets a password.** The old app stored Django's `pbkdf2_sha256`; this one writes
scrypt. `verifyPassword` learned to read the old format, and the existing rehash-on-sign-in path
upgrades it on first use, so a migrated hash survives exactly one login and is never written
back. The alternative was to reset seven passwords by email, and there is no mail transport --
which means the real alternative was locking everybody out of their own data. The read path is
tested against a vector generated by the old app's own Django rather than written from memory,
because two details fail closed and silently: the salt is literal text, not base64, and the key
is standard base64 where scrypt uses base64url.

**Derived ids, so the migration can be run twice.** Every row lands on a UUID v5 of its Mongo
`_id` under a fixed namespace, and every insert is an upsert. A migration that duplicates
everything on a second run is a migration nobody dares rehearse, and a migration nobody
rehearses is one that gets read for the first time in production.

**Dry run is the default; `--commit` is a deliberate act.** The report is the deliverable, not a
side effect. Its second half -- everything that could *not* be carried, counted, with a reason --
matters more than the first, because the failure mode of a migration is not a crash. It is
arriving six months later at "where did the budgets go?" with nobody able to say whether they
were dropped on purpose.

**Translate, never invent.** Where the old schema holds something this one has no home for, the
value is dropped and counted. No `EMPLOYEE` is promoted to `manager`, no free-text budget becomes
an invoice, no ambiguous owner is guessed at, and no unrecognised event type is stored under an
invented verb. Each of those would have been easy and each would have been a lie the data could
not defend.

**A client string becomes a company, and near-duplicates are merged in the open.** `"Obarfum "`
and `"Ô Bar'Fum"` are one client typed twice. They are grouped by folding away case, accents and
punctuation -- a narrow, deterministic rule rather than fuzzy matching, with no threshold that
could pull two real clients together. Every merge it makes is printed by name in the report, so
the decision is visible rather than silent.

**The old data is read, never written.** The connection prefers a secondary, nothing writes back,
and the rehearsal ran against a copy of the Docker volume. Until somebody says otherwise the old
app is still the system of record, and a migration that modifies its source is not a migration.

## Added during Objectives & KPI

**Progress is computed, health is computed, and neither is ever stored.** A stored progress
figure is wrong the moment a checkpoint is added; a stored RAG status is a field somebody has to
remember to update and nobody ever does. Both are derived from checkpoints people entered against
dates people chose. This is the same call as leave balances and the deliberate opposite of invoice
totals -- a balance is a fact about the present, a document is a snapshot of what was sent.

**Progress is measured from the start.** Going from 40 to 60 against a target of 100 is a third of
the way, not 60%. Recording `startValue` is what makes that possible, and tools that store only
the target are the ones that flatter their users -- the single thing a goal-tracking screen must
never do.

**"Not measured" is a first-class state.** It is not zero, and the difference matters: one of them
is a number that has not moved and the other is nobody having looked. It stays distinct in the
model (`currentValue` is nullable), in the mean (unmeasured key results are excluded rather than
counted as zero), on the screen, and in the accessibility tree -- the bar omits `aria-valuenow`
rather than reporting nought.

**No weighting, and no company health score.** An objective's progress is the plain mean of its
key results. Weights are invented in a meeting, never revisited, and make the headline number
impossible to check by eye; a single score blending unrelated goals is exactly the invented metric
the design rules forbid. If one key result matters more than the others, it is its own objective.

**Anybody may record a figure; only a manager may set direction.** The person who knows the number
is rarely the person with the permission, and requiring a manager for every measurement is how a
goal screen goes stale. Every checkpoint carries its author, so the record says who said so.

**Objectives are readable by everyone.** Direction that half the company cannot see is direction
nobody pulls towards -- the same argument that keeps channels open. Revenue targets are the
organization's own numbers, not anybody's salary.

**Values are integers in the scale their unit defines.** Cents, basis points, thousandths -- all
of them already in `money.ts`, reused rather than reinvented. A percentage is stored the same way
a tax rate is, and nothing on this screen has ever been a float.

**Amber, not red, for a goal that is behind.** Red is reserved for blocked, overdue, destructive
and the primary action. A number that is merely disappointing is none of those, and spending the
accent on it is how red stops meaning anything.

## Added during the SOP library

**The point of a procedure library is knowing what has gone stale.** Storage is a shared folder.
What a shared folder cannot tell you is which of its documents is now lying to people -- and a
procedure nobody has checked in a year does not sit there harmlessly, it gives wrong instructions
with the authority of having been written down. So every SOP carries a review interval and the
date it was last read, and the screen opens with the ones that are overdue or were never checked
at all.

**A review is one click, with no confirmation and no second signature.** This is the decision the
whole feature stands on. A six-month check that costs a form is a check nobody performs, and a
review queue that can never be cleared is worse than having no queue: people learn to scroll past
it, and then it cannot warn them about the one that matters.

**The owner may review their own procedure, whatever their role.** The opposite of the leave rule,
and deliberately so. Approving your own time off is a conflict of interest; confirming that the
procedure you wrote is still accurate is just the work. Requiring a manager to countersign is how
the queue becomes permanently overdue.

**Steps are rows, not prose.** A procedure is an ordered list of things somebody does, so it is
modelled as one. That means no Markdown parser and therefore no dependency and no HTML-injection
surface on text several people can edit -- and it gives the Templates milestone a step it can turn
into a task, exactly as a quote line already becomes one.

**Retired, never deleted.** "We used to do it this way and stopped" is a thing people need to be
able to point at, particularly when somebody asks why a client was handled differently two years
ago.

## Added during Templates

**A template carries a schedule, not just a list.** `offsetDays` on each task is the difference
between a checklist and a template: "kickoff on day zero, first cut on day fourteen, delivery on
day thirty" is the part nobody reconstructs correctly from memory, and it is what puts real
deadlines on a real calendar the moment a project is created.

**No default assignee, ever.** A template outlives the people in it. The person who always did
the edit leaves, and every project started afterwards quietly assigns work to somebody who is
gone -- and nothing says so, because the template looks fine. Assigning is a decision made per
project with the actual team's workload in front of you, which is what the project wizard exists
to show.

**Blank means no deadline, and that is a real answer.** Plenty of work in a project has no date,
and inventing one so the column is never empty is how a board fills up with deadlines nobody
believes. Anything that is not a whole number of days is refused rather than read as zero, which
would silently put a deadline on the first day of every project started from the template.

**Offsets are calendar days, not working days.** A template that says day thirty means thirty
days. Quietly turning that into six working weeks would surprise whoever wrote it. The weekend
rule belongs to leave, where somebody's allowance is being spent, and nowhere else.

**Three things now become tasks, and they all go through one transaction.** A quote's lines, an
SOP's steps, and a template's tasks -- `startProject` deliberately mirrors
`createProjectFromQuote` so a half-created project is not a state anybody can reach. Capturing
runs the other way: a procedure keeps its order and gains no schedule, and a project keeps its
shape and loses its calendar.

**A Server Action must not be named `use*`.** `useTemplate` read better than `startFromTemplate`
and made eslint treat it as a React hook. Noted because the better name is the trap.

## Added during Weekly Reviews

**Publishing freezes the numbers.** While a review is a draft its figures are computed live,
because the week is still moving. The moment it is published they are written into the row,
because a review is a *document*: opening last quarter's and finding this quarter's numbers in it
would be worse than useless, since the room never saw those. This is the same call as an
invoice's stored totals and the deliberate opposite of a leave balance -- the third time this
distinction has decided a schema, and it has been right every time.

**Every figure comes from a function that already existed.** Insights, objectives, procedures,
leave. Nothing new is counted in a review, so a review and the screens it summarises cannot
disagree. A fourth place for the company's numbers to be computed would be a fourth place for
them to be wrong.

**The screen leads with the weeks nobody wrote up.** A list of the reviews you did hold is a
diary; the value is the week you skipped. But *never reviewed* is not the same as *skipped*: an
organization that started reviewing in March did not skip January, and the week currently in
progress has not been missed either. Nagging somebody on a Tuesday about a week with three days
left in it is how a screen teaches people to ignore it.

**A decision carries an owner.** A decision nobody owns is a conversation, which is precisely the
criticism weekly reviews attract, and the thing that column exists to answer. Decisions come back
on the reviews screen once their date has passed, whether or not anybody remembered.

**The editor is on the page rather than behind a dialog** -- the one deliberate exception to the
rule that editing happens in a drawer or a dialog. A review is a document somebody types into
while the meeting is happening, and making the screen you read and the screen you write into two
different screens is exactly the friction that stops a ritual being kept.

## File storage, deliberately deferred

Four features each want somewhere to put a file: a receipt on an expense, a diagram in a
procedure, an attachment in a channel, a signed proposal on a deal. None of them is built, and
that is now a decision rather than a backlog item.

**The storage itself was never the hard part.** A directory inside the Compose volume needs no
new service, no credentials and no hardware -- the same shape as the mail transport, with a
driver interface and a local-disk implementation, so moving to S3 later would be configuration
rather than a rewrite. That could be built in an afternoon.

**What is missing is everything around it.** `backup-data.ps1` and the Compose story cover
Postgres and nothing else, so uploaded files would be the one part of this system with no
backup. Nothing bounds disk growth on a machine that cannot be added to. There is no retention
rule, no size limit worth the name, no scanning, and no answer to what happens when the volume
fills at four o'clock on a Friday.

Holding somebody's only copy of a signed contract without a backup is worse than not holding it
at all: a receipt reference in a text field is honest about being a note, where a file that
silently is not backed up looks like safekeeping. So the four features keep their current honest
shapes -- a reference rather than a receipt, a step rather than a diagram -- until there is an
operational story to attach them to.

**What should wake this up**, in order: somebody actually asks for it twice; or the deployment
moves somewhere with a backup story; or an invoice needs to carry a PDF attachment rather than
being read on screen. The first is the honest trigger and the other two make it cheap.

## Everything downstream of email, deliberately asleep

This deployment has no SMTP server and is not going to have one: it runs on one machine on a
local network, and people connect to it across that network. The mail transport already accounts
for that -- the default driver records every message and delivers none, and the outbox under
Settings is where an admin reads an invitation and passes the link on by hand. Invitations and
password resets are complete features on that basis, not degraded ones.

What is asleep is everything that would be built *on top* of delivery: reminders, weekly digests,
chasing an overdue invoice or an unreviewed procedure, meeting invitations by email, `.ics`
export, and HTML message bodies. Every one of them assumes a message reaches somebody without a
person carrying it, and on this network none of them does. Building them would produce a queue
that fills up with things nobody will ever read, and a screen full of features that appear to
work and quietly do not.

**The SMTP driver stays.** It costs nothing -- `nodemailer` is imported on demand, so the LAN
build never loads it -- and it is the whole margin: the day this moves to a VPS, `MAIL_DRIVER=smtp`
starts delivering the same rows, including the ones queued before the move. Removing it would be
work done to make a later decision harder.

**What should wake this up** is that move, and nothing else. Not somebody asking for reminders --
the honest answer to that today is that the app cannot send them.

## Added during the guided tour

**The tour rings the real thing.** `data-tour` goes on the actual rail, the actual palette
button, the actual avatar, and a rule in `globals.css` outlines whichever one is active. The
alternative -- a card that floats beside its target -- needs measured coordinates written into a
`style` attribute, and inline styles are forbidden here. The card therefore sits in one fixed
place and the *target* is what moves, which also means nothing to recompute on scroll or resize
and identical behaviour at 320px and 1440.

**Shown once, and recorded on the user.** `users.tour_completed_at` rather than `localStorage`:
whether somebody has been shown around is a fact about the person, not about the browser they
happened to be sitting at. Doing the tour on the studio machine should not mean doing it again
on your own laptop.

**Skipping is an answer.** It writes the same column as finishing. A tour that reappears until
you complete it is not guidance, it is a demand, and the second showing teaches nobody anything.

**Seeded staff are onboarded in the seed.** They have worked here for months. The practical half
of that decision is that leaving them otherwise put the card in front of every e2e fixture on
every screen.

## Added when quotes and invoices learned to print

**The design was not invented.** BrandShift already had a devis renderer -- three HTML tools
sharing one jsPDF layout -- and quotes have been going out in it since June. Matching it was
cheaper than designing something, and more importantly a client who accepted a devis should
recognise the invoice that follows it. What was translated rather than copied: colour, which
comes from tokens because the codebase forbids the hex the original wrote twelve times; and
type, which is Space Grotesk and Inter -- the fonts that tool always declared, and that the PDF
only missed because jsPDF ships none.

**The printed document is a separate route, not a mode.** `/finance/quotes/[id]` is for the
person selling the work: status, the convert-to-project handover, the decline reason. The print
route is for the person being sold to. Folding them together would mean one screen with a
switch on it, and the thing you want to send somebody would have no address of its own.

**A sheet is always paper.** `.sheet` redefines the semantic surface and foreground tokens to
their light values, so the document is ink on white whatever theme the reader has chosen. The
component never learns about this -- it goes on writing `text-fg-muted` like every other screen,
and the scope decides what that means. The alternative, a second set of print-only classes,
would be a parallel design system to keep in step.

**A document does not reflow.** The sheet is 210mm wide at 320px as at 1440, and scrolls inside
its own container. A quote that rewraps on a phone is not the quote that was sent, and the
page itself still never scrolls sideways -- which is the rule that actually matters.

**The letterhead lives on the organization.** Tagline, city, website and contact email are
columns on `organizations`, all nullable and each printed only when set. Two tenants on one
machine send out two different letterheads, so it is not a config file; and a quote with no
tagline should have no gap where a tagline would go.

## Added when the documents became files

**The PDF is a render of the print route, not a second drawing of it.** The obvious
alternative -- a PDF library building the letterhead from the same data -- is two
implementations of one design, and they diverge the first time either is touched. That is not
hypothetical: the devis this design came from lived *only* inside a jsPDF generator, which is
exactly why it could never be shown on a screen, emailed as HTML, or reused here without being
read line by line and translated. Driving a headless browser costs an image with Chromium in
it; the alternative costs a design that is wrong in one of the two places.

**Chromium comes from Alpine, not from Playwright.** `npx playwright install` fetches builds
linked against glibc, and this image is musl -- they install cleanly and then refuse to start.
`playwright-core` is the driver alone and downloads no browser, so the runtime dependency is
`apk add chromium` plus `PDF_CHROMIUM_PATH`. The font packages beside it are not decoration:
an image with no fonts renders anything the self-hosted faces do not cover as empty boxes, and
nobody notices until it is in a PDF that has already been sent.

**The headless browser is given the caller's own cookie.** It authenticates as the person who
pressed the button and nothing more, so it cannot read a document they could not. The route
checks `finance.view` and fetches the row *before* launching anything, so an unauthorised URL
costs a query rather than a browser.

**A malformed id is a missing row.** Every id here is a `uuid` column, and Postgres raises
rather than returning nothing when it is handed arbitrary text -- so a typo in a URL was a 500,
which tells a browser, a crawler and an uptime check that the application is broken. The guard
went into the twelve getters rather than the pages because the pages are not the only callers:
a task id arrives in a query string, and Server Actions read rows by id too. Every one of those
getters already returned `null` for "no such row", which is exactly what a malformed id means.

## Added at the Mediast rebrand

**The brand red moved, and the ramp was re-derived rather than re-typed.** `#FD0000` became
`#FF3B22`. The red ramp is not twelve chosen colours -- each step's lightness was solved so that
600 carries white text at 4.5:1, 400 clears 4.5:1 on the lightest dark surface, and so on. So the
new anchor changed only the hue (29.23 -> 30.92); every step kept the lightness it was solved for,
and chroma is the most the new hue can hold there. All twenty-seven contrast assertions in
`tokens.test.ts` pass unchanged, which is the point of having had them.

The new red is *weaker* on white than the old one: 3.56:1 against 4.06:1. Both are below the 4.5:1
that body text needs and above the 3:1 that large text needs, so the rule is unchanged -- red is
for non-text and for display sizes -- but the margin is thinner, and `--accent` (600) remains the
only red that may sit under a white label.

**The document is ink; the red only signs it.** The devis this design follows sets the wordmark,
the DEVIS label and the totals bar in near-black, and spends its red on a full stop after the
name and on the bullets. That is now what the sheet does. The totals bar is the largest filled
shape on the page, and filling it with brand red spends the entire <=5% allowance on a figure
that is not an action -- the earlier port did exactly that.

**A line says what it covers, and what it does not.** `details` and `exclusions` are two text
columns on `quote_lines` and `invoice_lines`, newline-separated, the same convention `terms`
already used. Two columns rather than one with a marker character, for two reasons: an exclusion
is rendered differently and printed last, so it is a different kind of thing rather than a flag on
a bullet; and any in-band marker -- a leading `-` being the obvious candidate -- is precisely what
somebody typing a markdown list produces by accident. The editor asks the two questions
separately, so there is no syntax to learn.

**The scaler's screen padding is removed in print.** `pb-10` under the sheet is breathing room on
a screen and the first 10mm of a blank second page on paper. It had been there since the print
route shipped and cost nothing only because the sparser layout never reached 285mm; the moment
lines grew bullets, every PDF gained a trailing sheet. It needs `!important` because the padding
arrives as a Tailwind utility and utilities outrank the components layer -- whether a document is
one page is not a decision a spacing class on a wrapper gets to make.


## Added when departments needed a way in from the rail

**Departments nest under People (Team, for a member), the same way channels nest under Work.**
`Destination.expandable: boolean` became `expandableChildren?: "channels" | "departments"`, so two
destinations on the same rail can each carry their own kind of child without one's `withChannels()`
overwriting what the other's `withDepartments()` set. The cap of five still holds -- nesting is
exactly the mechanism that already let channels exist on a five-slot rail at all, and departments
spend nothing further from that budget.

**No trailing "see them all" row, unlike channels.** `All channels` exists because Work itself is
not the unfiltered channel list -- it is a different page. `/people` *is* the unfiltered list, so
the parent row a department nests under already goes exactly there; a second link to the same place
would be decoration, not a route to anything.

**A department's row does not light up when you are on it.** A channel is its own path
(`/channels/<slug>`), so the rail's ordinary path-based highlighting picks it out correctly. A
department is a query param on `/people`, because that is what the filter already was before this
-- and query params are exactly what the rail's `isActive()` does not look at. Giving departments a
real route of their own to fix this would be solving a cosmetic problem by building a second way to
reach the People directory. The rail says "you are in People", which is true; the page itself, via
`PeopleFilters`, is what actually shows which department is selected.

**An organization with no departments yet shows nothing, not a dead-end chevron.** `withDepartments`
sets `children: []` rather than skipping the destination, and `Sidebar` already treats an empty
array the same as none at all -- so a fresh `/signup` shows a plain People row, and the moment an
admin creates the first department it appears with no other change anywhere.

## Added when a fresh organization had nowhere to put its departments

**Departments could be read everywhere and created nowhere.** `/signup` sets an organization's
name and nothing else, so a real organization starts with zero -- and until now there was no form,
no Server Action, no way in at all short of the seed script. Every other screen that depends on one
existing (the People filter, the invite dialog's picker, a project, a template, an SOP) was already
built and already correct; the gap was upstream of all of them.

**Behind `organization.editSettings`, not `member.invite`.** The permission already existed,
admin-and-above, unused by anything -- this is what it was for. A department is the org's own
shape, the same question as its name or its timezone, not something that belongs beside inviting
one person at a time, which is open to managers as well as admins.

**In Settings, not on the People page.** People already reads departments -- the filter, the
invite picker -- but adding one is structural configuration, not a people action, and Settings is
where this app already puts things gated by role rather than by what a screen happens to be about.

**Two departments may share a name; the DB only enforces the slug.** The uniqueness index is on
`(organizationId, slug)`, and `uniqueDepartmentSlug` mirrors `uniqueSlug` in `data/templates.ts`
exactly -- append `-2`, `-3`, ... until one is free -- rather than refusing a duplicate name
outright. Two departments both reading "Design" is a real, if unusual, org chart; a slug collision
is not a business rule, it is a database constraint, and the fix for one should not masquerade as
a rule about the other.

**Naming, editing and archiving a department are not built.** Create was the actual gap -- a fresh
organization with nothing to assign anyone to -- and the schema already carries `description` and
an eventual `leadUserId` for later, but a rename/archive screen is a different, smaller problem for
whenever the first organization actually needs one. Recorded in `KNOWN-GAPS.md` rather than built
speculatively.

## Added when this shared a domain with something else

**Mounting the app under a sub-path (`/os`) is a build-time flag, `NEXT_PUBLIC_BASE_PATH`, not a
runtime one.** Next.js compiles `basePath` into the bundle -- every `next/link`, every asset URL,
every Server Action redirect -- so it cannot be changed by setting an environment variable on an
image that already exists, only by rebuilding with a different one. Empty is the default and stays
the default: local dev, the e2e suite, and an ordinary LAN deployment all still own the whole
origin, and nothing about them changed. A deployment sharing its domain with something else sets
`NEXT_PUBLIC_BASE_PATH=/os` before its first build instead.

`NEXT_PUBLIC_`, not a private name: a small number of places build a path by hand rather than
going through the router at all, because they were never a navigation to begin with -- an
`EventSource` subscription, a plain `<a download>` for a PDF, a link inside an emailed message,
the server rendering its own print route to a PDF with a headless Chromium. None of those are
`next/link`, so none of them are prefixed automatically, and the browser-side ones need the value
in the browser. `src/lib/base-path.ts` is the one place that reads it; everything else imports
`withBasePath()` from there rather than reading the environment variable itself.

**Most of the framework already does this correctly, and it was worth actually checking rather
than assuming.** `next/link`, `next/image`, and a Server Action's `redirect()` all pick up the
configured base path with no code changes -- verified by building with `NEXT_PUBLIC_BASE_PATH=/os`
locally and watching a real sign-up, sign-in, and page-to-page click-through, not by reading that
it should work. The one place that genuinely does not is Edge Middleware: `NextResponse.redirect(new
URL(path, request.url))` replaces the request's whole path with `path`, and middleware runs before
Next re-adds the base path to anything, so a raw absolute path there drops it entirely. The fix
reads `request.nextUrl.basePath` -- the framework's own per-request answer, already correct in
every build -- rather than importing `src/lib/base-path.ts`'s copy of the same fact a second way.

**The healthcheck lives under the base path too**, because Next does not exempt `/api/*` routes
from it -- confirmed the same way, not assumed. The healthcheck's own `${NEXT_PUBLIC_BASE_PATH:-}`
in `docker-compose.yml` has to be kept in step with whatever the image was actually built with, the
same way the build's own `args:` block is: both read the one value in `.env`.

## Added while preparing a real deployment

**`docker-compose.yml` now loads `.env` into the app container wholesale, via `env_file`, instead
of naming a fixed list of keys under `environment:`.** `APP_URL`, `HTTPS` and the mail settings
are all read straight from `process.env` in code, and none of them were named in the compose
file -- so setting any of them in `.env` had done nothing, on every deployment of this, ever. It
went unnoticed because `MAIL_DRIVER` defaults to `outbox` (nothing tries to send, so a wrong
`APP_URL` never showed up in a real email) and `HTTPS` only matters once something is actually
served over TLS in front of the container, which nothing had been yet.

`env_file` rather than adding each key as `${VAR:-}` under `environment:`: an env var named that
way is set to the empty string the moment `.env` doesn't define it, and empty and absent are not
the same thing to `env.ts`'s schema. `SMTP_PORT` in particular is `z.coerce.number()...`, and
`Number("")` is `0`, which then fails the schema's own `.min(1)` -- so the naive fix would have
made the app crash at boot on every install that leaves `MAIL_DRIVER` at its default, which is
all of them. `env_file` only ever sets a key that `.env` actually sets, so an absent `APP_URL`
still reaches the code as `undefined` and takes its documented default.

`environment:` still overrides the handful of keys the container genuinely needs a different
answer for than the host does: `DATABASE_URL` (the app reaches Postgres by the Compose service
name, not by the loopback address `.env`'s own copy is written for) and `PORT` (the container's
own listening port is always 3000, regardless of where `APP_PORT` publishes it on the host).
`environment:` is applied after `env_file`, so these two still win.

## Added while closing out the UI/UX audit

**No route under `(app)` gets a `loading.tsx`, even a scoped one.** The audit asked for loading
skeletons; one was added app-wide, then narrowed to five route folders that seemed to have no
`notFound()` call anywhere beneath them. Both versions were wrong for the same reason: the
`(app)/layout.tsx` that calls `requireUser()` is an *ancestor* of every one of those folders, and
Next commits the HTTP status to 200 the instant any descendant Suspense boundary starts
streaming -- so a `loading.tsx` five levels down silently took away the 401 a revoked session is
supposed to get, not just the 404s it was screened for. `e2e/anonymous/auth.spec.ts`'s "a session
revoked from another device explains itself" caught it once the folder-by-folder check missed it.
A route-level skeleton and a layout that decides the status code by throwing cannot coexist; see
the `KNOWN-GAPS.md` row next to the one about the digest check running in the page. Fixing this
properly means moving the auth check into middleware first, which is its own decision, not a
side effect of adding a spinner.

**`Button`'s `nativeButton` prop is never inferred from `render`.** The audit's fix for a Base UI
console warning ("expected a native `<button>`") set `nativeButton={false}` automatically whenever
`render` was a `Link`. `nativeButton: false` does not change what tag gets rendered -- that is
`render`'s job -- it tells Base UI the element is not already interactive, which makes it inject
`role="button"` to compensate. On a `<Button render={<Link href=...}>}>` that overwrites the
anchor's real `role="link"` with `role="button"`, which is wrong (a link is not a button dressed
as one) and broke every `getByRole("link", ...)` assertion aimed at one -- `sheet.spec.ts` in
full, and the "New quote" and Print controls in `finance.spec.ts`. Reverted to Base UI's own
default. The console warning is real and stays open, next to the same warning on
`DialogClose render={<Button>}` in `KNOWN-GAPS.md` -- both are a dev-only nag about a pattern
that is semantically correct, not a bug to chase.

## The default currency is MAD, not EUR

`organizations.currency` has always been a real per-tenant column -- every quote, invoice, deal
and expense reads it rather than assuming one -- but the column's own default was `EUR`, left
over from before the Mediast rebrand. Nothing had ever set it otherwise: `/signup` and the seed
script both insert an organization without naming a currency, so every organization that has ever
existed here, including the one actually running at mediast.ma, got `EUR` it never chose. Fixed
at the schema default (`MAD`), with a migration (`0017_outgoing_whiplash.sql`) that also backfills
every existing row still standing on the old default -- safe, because nothing has a way to choose
a currency on purpose yet, so a row on `EUR` is a row that never got asked, not a row that meant
it. `src/db/migrate/run.ts`'s Mongo migration already defaulted its own `currency` flag to `MAD`,
which is what made the mismatch obvious rather than assumed.

- **Supabase / managed Postgres** -- would have given Realtime and RLS for free, but the
  requirement is that everything runs on the local network.
- **Restyling the existing Angular app** -- cheaper, but tenancy, permissions and the task schema
  all block the target UX.
- **A full custom role builder** -- a whole feature area and easy to make confusing. Named roles
  plus module flags cover the real cases. Revisit if a customer actually asks.
- **Postgres row-level security** -- auth is custom, so tenancy is enforced in app code via
  `withOrg()`. Accepted risk; the guardrail is that no raw query on a tenant table is permitted.
