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

## Added when the task board learned to drag

**The board is not read-only, and that is not the same decision the CRM pipeline made.** The
pipeline's own rule reads "a drag has no keyboard equivalent, no confirmation, and nowhere to put
a question -- and moving a deal to Lost has to ask why." A task moving to `blocked` has exactly
that same problem, and it already had an answer before this: `reportBlocker(taskId, reason)`
requires one. The board's drag reuses that same requirement at the moment of the drop -- the
question the pipeline's decision says a drag cannot ask gets asked here too, just interactively
rather than by refusing the drag outright. The two screens differ because one of them solved its
"needs a reason" problem and the other has not yet, not because task status and deal stage are
different kinds of thing.

**Keyboard movement is four buttons, not a keyboard-driven drag.** dnd-kit's keyboard sensor
reorders within one `SortableContext` out of the box; moving an item into a *different* container
by keyboard is not built in; its own "multiple containers" reference example hand-rolls it, and
doing the same felt like more surface than the problem needed. SOP steps and template tasks
already solved the identical shape of problem -- "a drag has no keyboard equivalent" -- with plain
Move up / Move down buttons. The board's four chevrons per card (two for reordering within a
column, two for moving to the adjacent one) are the same answer, applied here: real drag-and-drop
for a pointer, the same underlying move for anyone else, through the same code either way.

**The dragged card's own transform is a deliberate, narrow exception to "opacity and color
only."** `CLAUDE.md`'s transition rule bars translate and scale everywhere else in this app, and
that holds: no card's resting, hovering or focused state moves. The one exception is the card
actually being dragged following the pointer, which is not a decoration on top of the gesture --
it *is* the gesture. `prefers-reduced-motion` still gets a real accommodation: dnd-kit's cosmetic
drop-settle animation is skipped for it, and the keyboard path (the four buttons) never produces a
transform in the first place, so reduced motion loses nothing functional either way.

## Added when Today learned what's actually late

**Priority is a word, not a color.** `CLAUDE.md`'s tone vocabulary is closed on purpose --
"green means complete, amber means needs attention, blue means in progress, red means blocked or
overdue, and none of them ever means anything else... a screen that wants a fifth meaning needs a
fifth word, not a spare colour." Marking an urgent task with a red dot would be exactly the sixth
meaning that rule exists to stop. `task-drawer.tsx` had already solved "show this task's priority"
without touching the palette -- a neutral-tone `StatusPill` with the word itself (`Priority` /
`Urgent`, `High`, ...) -- so the row reuses that same pill rather than inventing a color, shown
only for `urgent`/`high` since `medium`/`low` are the default and showing them everywhere would be
noise, not information.

**A task reads as overdue independently of what its status happens to be.** Before this,
`TaskListFlat` (Today's own list, unlike the project and person pages' bucketed `TaskList`) colored
a row's date from `task.status` alone, so a `todo` or `in_progress` task past its date read exactly
like one due next month -- only a task somebody had separately marked `Blocked` ever turned red.
`TaskList` already got this right by accident: `bucketTasks()` sorts by due date before status is
ever consulted, so its `overdue` bucket's tone already meant the right thing. The fix moved the
question into `TaskListRow` itself (`isOverdue()`, `src/lib/due-date.ts`) so neither list can regress
this way again, and kept status and lateness visually separate on purpose: the icon *shape* still
comes from status (a hollow circle stays a hollow circle), and only its color, and the date's, flip
red when the row is actually late. Borrowing the triangle glyph that already means "blocked" for a
task nobody has blocked yet would trade one confusion for another.

**"View all" got a real page instead of a fixed link.** The coordination queue's cards cap at eight
rows so a daily glance never scrolls, and the "View all" underneath used to point at `/work` --
which lists *projects*, not tasks; there was no screen a capped column could actually hand off to.
`/work/queue` is that screen: the same `coordinationQueue()` read, uncapped, with `?bucket=` to jump
straight to the column that was full. Gated with a proper `can()` rule (`task.viewQueue`) rather
than copying Today's own inline `atLeast(actor, "manager")` check -- which still exists, unchanged,
and is exactly the inconsistency `KNOWN-GAPS.md` now names rather than quietly doubling.

## Channels stop being open-join

**Reversed, not forgotten.** Channels shipped with `channel.view`/`channel.post` open to
everyone in the org, and the reasoning was written down in two places: the channel page's own
doc comment ("anyone in the organization can read any channel") and `authz.ts`'s own comment on
the rule ("a conversation half the company cannot join is a meeting held in a corridor"). That
argument was never wrong for a project or deal channel's *own* people -- being on the work is
still what gets you in, instantly, with nothing to ask (`joinChannel()`, called only by
`ensureProjectChannel()`/`ensureDealChannel()`). What changed is the door standing open beside
it: anyone else, browsing in from "All channels" or just posting a first message, walked into
any conversation with nothing to stop them. Requested explicitly, closed on purpose -- this is
the second time this app has drawn that line differently for "provisioning" (decided by whoever
already controls the work) versus "asking" (decided by whoever can say yes), the first being the
task board's own `saveBoardChanges` membership check.

**Approved by an admin/owner, or specifically by whoever made the channel.** Not admin alone:
a channel's own creator knows who belongs in it at least as well as an admin who has never
looked at it, and requiring an admin for every general channel's every request would make the
feature about admins' time rather than about the right people finding each other. Mirrors
`meeting.manage`'s exact shape -- an org-wide rank, or the one person closest to this specific
row.

**A declined request looks exactly like one never made.** `channelMembers.status` has three
values, but the UI only ever shows two: "Request to join" or "Requested" (see
`components/channels/membership.tsx`). Telling someone they were declined, specifically, adds a
fact that helps nobody and stings for no reason; re-asking is free either way, so the visible
state might as well be the same.

**Existing memberships are untouched.** `status` defaults to `active`, so this is a gate on
requests made from here on, not a retroactive lockout of every channel every person had already
joined the old way.

## Added during the client-project flow

**`stage` and `status` are two different columns.** A project's `status` is the health of the
work (active, on hold, done); its `stage` is where it sits in the client delivery flow
(onboarding … reporting). They move independently -- a project can be `active` in
`client_validation` or `on_hold` in `production` -- and collapsing them into one enum would
force a choice between describing health and describing phase.

**Eight stages, and the list is closed.** The same rule as `deal_stage`: every pipeline that
grows a tenth stage grows it because somebody wanted a report. The eight are the stages the SOP
library already names. A project with **no** stage is deliberate and common -- an internal
build does not run the client flow -- and it simply never appears on the pipeline board.

**The pipeline board is not a sixth destination.** Every rail is already full at five, so
`/work/pipeline` is a second view of Work reached from a toggle and from the command palette,
the same call CRM makes between its list and its board.

**A document is ordered sections, not a rich-text body.** The same decision as an SOP's steps,
for the same reason -- it renders with no Markdown parser and is not an HTML-injection surface
for text several people edit -- and the Notion pages it was imported from were already
heading-sectioned, so nothing was lost by the shape.

**The pipeline board *is* draggable, where the CRM board is not.** Moving a deal to Lost has to
ask why; moving a project between delivery stages records nothing anyone has to explain, and
every drag has a keyboard equal in the two chevrons on each card. So the reason the CRM board
stayed read-only does not apply here.

**One implicit playbook, not a table of them.** The organisation runs one delivery flow -- the
eight-stage enum *is* the flow, the SOP library *is* its procedures. So `stage_playbook` is one
row per stage, no name and no slug. A second client-type that needs its own flow is a later
table; building it now would be a config screen for a choice nobody is making.

**A stage's schedule anchors on entry, not on the project's start.** When "Set up this stage"
runs, the template's `offsetDays` are counted from that day. A stage's clock starts when you
reach it -- a production template that says "shoot on day 14" means fourteen days after
production begins, not after the project did, which could be months earlier.

**Setup is manual, and runs once.** Reaching a stage does not automatically create its tasks --
a button does, and `project_stage_setup` stops it running twice. Auto-firing on stage change
would double up every time a project moved back and forth, and "the last task of a stage is
done, propose the next stage" is a smarter trigger that belongs in its own pass, not bolted
onto the drag.

**A deliverable is not a task with a `kind`.** They have different lifecycles -- a task is
todo/doing/done, a deliverable goes out to a client and back for revisions -- so they are
different tables. A `kind` column on `tasks` would make every task query, board and bucket
have to know the difference and filter for it, forever, to keep the two apart on screen.

**Converting a task to a deliverable deletes the task.** A row cannot be both, and keeping the
task alongside the new deliverable would show the same piece of work twice on every list. The
conversion is one transaction; there is no undo beyond making a task again by hand.

**The imported Notion tasks were not auto-reclassified.** Roughly twenty of them read as
deliverables, but the `Task Type` property was blank on all but two, so there was no signal to
split on -- only a fuzzy title match against live production data. Conversion is a deliberate,
one-at-a-time action instead.

**Changing a piece of work's state is gated to the people on it, and the gate lives in the data
layer.** Starting, completing, blocking, unblocking or reassigning a task -- and walking a
deliverable along its line -- is now the task's assignee, a lead or contributor on its project,
or a manager. Not assignee-only: a lead has to be able to finish or unblock something for a
colleague who is away. The check is `mayWorkOn()` in `src/lib/data/project-access.ts`, not a
rule in `authz.ts`, for the same reason `saveBoardChanges`, `markChannelRead` and `joinChannel`
scope themselves there -- "am I on this project's team" is a `project_members` join, and
`can()`'s `Resource` knows a single owner, not a membership table. The drawer and the
deliverables panel hide the controls the same way, so a hidden button and a refused action
cannot disagree. Overdue work that chases someone is explicitly a separate plan: it needs the
scheduler and mail transport this deployment still lacks (see `KNOWN-GAPS.md`).

- **Supabase / managed Postgres** -- would have given Realtime and RLS for free, but the
  requirement is that everything runs on the local network.
- **Restyling the existing Angular app** -- cheaper, but tenancy, permissions and the task schema
  all block the target UX.
- **A full custom role builder** -- a whole feature area and easy to make confusing. Named roles
  plus module flags cover the real cases. Revisit if a customer actually asks.
- **Postgres row-level security** -- auth is custom, so tenancy is enforced in app code via
  `withOrg()`. Accepted risk; the guardrail is that no raw query on a tenant table is permitted.

## Added when the whole app went real-time

**Every tenant write announces itself, from the one place every write already goes.**
`withOrg()`'s `insert` / `update` / `delete` each emit a `pg_notify('brandshift_live', {org,
topic})` after the row lands. That is the same choke point tenancy itself is enforced at, so a
new Server Action cannot forget to be live any more than it can forget to be scoped -- there is
nothing extra to remember. The channel bus (`publishChannelChange`) already proved the shape;
this generalises it.

**Coarse topics, one per screen family, and the browser refetches through the server.** The
notification says `tasks` or `finance` moved, never which row. `LiveSync` in the shell calls
`router.refresh()`, which re-runs the current route's server components -- so what arrives live
and what arrives on a reload come from one code path and cannot drift apart, and a message or a
task never travels as a second, cheaper copy that has to be reconciled.

**The client refreshes on any change, not the one on screen.** Deciding client-side whether a
change touches what is rendered is harder and more fragile than just refetching; the debounce
and a "wait until ~1.2s after the viewer's last click" gate keep it cheap and, crucially, stop a
background refresh from landing on top of a Server Action the viewer just fired (which is how it
first broke the guided-tour test). Topic-to-route matching is noted in `KNOWN-GAPS.md` as the
refinement.

**A second `LISTEN` connection, not a shared one.** `live-bus.ts` is its own hub and its own
Postgres connection, independent of the channel bus. Two features that both hold a long-lived
connection, each a few lines, beats one shared abstraction where a bug in either silences both.

**The write wrapper stays lazy and keeps `.toSQL()`.** `announcing()` returns a thenable that
runs -- and announces -- only when awaited, and awaiting twice still runs once. `tenancy.ts`'s
tests read `.toSQL()` off these builders and never await them; that contract is unchanged.

- **A shared broker (Redis, a WebSocket gateway)** -- every extra service is another thing down
  at 9am. Postgres was already required and already where the write went.
- **Publishing explicitly from each `revalidatePath` site** -- ~60 call sites across 22 files, and
  forgettable on the 61st. The `withOrg()` choke point cannot be skipped.
- **Routing the notify through the caller's transaction** -- would make it rollback-correct and
  self-deduping, at one round trip per write. Matched `publishChannelChange`'s existing pooled
  fire-and-forget instead; the cost of the edge case is one wasted refetch.

## Added when a member's view was narrowed to their own work

**A member sees their own work and nobody else's.** Until now the app was open by design -- the
roster, every project's task list, the activity feed and everyone's person-page were readable by
any member, on the argument that shared context beats siloing. That is right for a studio that
coordinates in the open; it is wrong for one where a member should not be able to watch a
colleague's progress. So a `member` now gets: their own tasks, the projects they are on, and
their teammates *by name*. A manager, admin or owner is unchanged -- coordinating the whole org
is the job.

**The rule is `seesOnlyOwnWork(actor)` in `src/lib/data/visibility.ts`, keyed off the role, and
it lives in the data layer.** Not `authz.ts`: this is a "which rows" question, not a "may I"
question, the same reason project-membership checks are in the data layer. What it narrows:

- `/people` -> **unchanged**: the whole roster, same as before the silo. This is the org chart --
  who works here -- not a window onto anyone's work, so it stays open. What it drops for a
  member is a link into anyone else's page (names other than your own render as text, not a
  link) and the department column and filter, which are a coordinator's view of how the org is
  organized rather than part of a roster. Corrected after the first pass narrowed this to
  teammates on shared projects only, which turned out to read as "can't see the team" rather
  than as privacy.
- `/people/<someone else>` -> `notFound()`. Your own page still works.
- The sidebar's department rows (nested under People/Team) -> gone for a member, for the same
  reason the directory drops the column: it is org structure, not a roster.
- `/work` -> only projects you are on; per-project counts are of your own work.
- `/work/<key>` you are not on -> `notFound()`.
- A project's Tasks and Deliverables -> your own only. Its Activity tab -> gone. Its Team tab
  stays, as names without roles.
- The command palette's *people* entries stay teammates-only, unlike the directory: a palette
  entry is a jump to a page, and a non-teammate's page still 404s for a member, so listing it
  there would be a dead link the plain roster never promises to open. No department entries.
- `listAssignablePeople` -> your teammates, so the reassignment picker is not a way around it.

**The one crack in the wall is the handoff link.** A member may see a single upstream or
downstream task -- its title, its status, its assignee's name -- because "is the thing I am
waiting on done yet, and who has it" is a question they legitimately need answered. Nothing
more of that task or that person is exposed. See `task-links.ts`.

**The calendar, objectives, weekly reviews and channels are deliberately left open** for now --
narrowing them is a follow-up, recorded in `KNOWN-GAPS.md` rather than half-done here.

## Added with the handoff link and the corner toasts

**A handoff is a row in `task_links`, not a status on the task.** "The thumbnail is waiting on the
video edit" is a relationship between two tasks, so it is its own table -- `blocked_task_id`
needs `blocking_task_id` first. Both are on the same project (a cross-project link wants a task
search that does not exist yet). It is created by the person on the waiting task, or a manager --
you declare your own dependency -- and the check lives in the actions, next to `mayWorkOn`, not
in `authz.ts`.

**The link is the one thread that reaches across the member silo.** Through it a member sees a
single upstream or downstream task as a title, a status and a name -- nothing else, and nothing
about that person beyond the name. Everywhere else a member sees only their own work; here they
see just enough to know whether they are unblocked and who to chase.

**The nudge is `task.nudged`, rate-limited by the row itself.** `last_nudged_at` gates it to once
every twelve hours, so a reminder stays a reminder. It fans out to the assignee of the task that
is holding things up; `task.completed` now also notifies the assignees of everything that task
was blocking, so the person waiting hears it moved without being nudged back. Auto-nudging an
overdue upstream task is a separate plan -- it needs the scheduler half a dozen gaps wait on.

**The corner toasts reuse everything.** The bottom-right viewport is the one an action
confirmation already uses; the wording comes from the same `describeNotification` the inbox
list uses, so an event is never phrased two ways. `NotificationToasts` does not open a third
SSE connection -- it reads the unread list the shell hands it, kept current by `LiveSync`'s
refresh, and pops what is new. Its first render only remembers what is already there, and a
page reload does the same, so coming back to a tab does not replay a morning of notifications.

- **A toast is now more than "you did a thing"** -- the component's doc said it was only for the
  result of an action the viewer took. Pushed notifications now use it too; state the viewer did
  not cause is exactly what a toast in the corner is for when it is something they should see now.

## Added when members started planning their own work

**Adding a task was never actually restricted; it was never actually offered.** `task.create` had
been open to everyone since `authz.ts` was first written, and `createTask()` had the right
`mayWorkOn()` check on the project case already -- there was simply no "New task" button anywhere
in the app, and the `Task.newTask` string had sat unused since it was written. The member could
not plan a website's frontend, backend, database, API and CI/CD as separate tasks not because of
a rule, but because of a missing form. Closing that gap is most of this change; the rest is making
the gap itself visible when somebody does not close it.

**`createTask()` now also takes a description, and a personal task always assigns itself.** The
column existed; nothing wrote to it. And a to-do with no project had no check on who it could be
assigned to at all -- reachable by nobody today because nothing called the action, but worth
closing before something did: it is now always the creator, the same way a personal task has
always conceptually been theirs.

**Running a stage's setup split off from moving the project's stage.** Both were `project.setStage`
before this -- a manager's call, or the project owner's. Instantiating a stage's tasks and document
stubs is work, the same kind `mayWorkOn()` already gates everywhere else; deciding the project has
actually *reached* a new stage is the client-facing fact the pipeline board and the stage rail show.
Collapsing them meant a contributor could not one-click the six tasks a stage already names for
them, which is the whole point of having a playbook. `setUpStageAction` now checks `mayWorkOn()`;
`ProjectStageControl`'s own gate is untouched.

**"No plan yet" is computed, not stored, and it is read-only information.** A project member past
`organizations.planning_grace_hours` (default 48h) with zero tasks of their own on that project.
No new table: `project_members.addedAt` already existed, and the check against `tasks` is one
query plus an in-memory anti-join, the same trade `workloadFrom()` already makes at this scale.
Deliberately not a stored warning, a strike, or a record that outlives the thing it is about --
it disappears the moment a task exists, because the fact it reports is "this is empty right now",
not "this happened, on this date, and is now part of a file on you".

**The threshold is a column, not a constant, because changing it should not need a deploy.**
There is no Settings field for it yet -- the same honest gap the letterhead already has -- so
today that is a SQL statement. The number itself was asked for directly: 48 hours.

**It shows three places, each already built for exactly this kind of fact.** A neutral banner
on the member's own project (and their own Today, across every project they are on) while they
are inside the grace window, turning amber once they are past it -- the same fact, a louder tone,
never a new screen. A fourth card in the coordination queue, beside Blocked / Overdue /
Unassigned, once it actually becomes something a coordinator should act on. Nothing pushes a
notification at hour 48 -- there is no scheduler -- so the signal is exactly as honest as
`isOverdue()` already is: visible wherever someone looks, never promised at a moment nobody is
looking.

- **A required minimum task count** -- the one shape of this idea actively rejected. It rewards
  splitting "build the site" into six empty titles instead of a plan anyone could read, and it is
  enforceable by counting rows in a way that a real breakdown is not.
- **A stored strike or warning record** -- a disciplinary history that would then need managing,
  appealing and clearing. The visible signal already does the job and clears itself.
- **Gating "no plan" by task count on the whole project rather than by person** -- would reward a
  lead who has planned everything under their own name and nobody else's, which is not the thing
  being asked for. The check is per person, per project, on purpose.

## The shell owns the scroll region, and a menu link now closes its menu

**The rail used to move when a tall page scrolled, because nothing was actually pinning it --
the shell's outer row only had a *minimum* height.** `min-h-dvh` lets the row grow past one
viewport the moment a page is taller than the screen, and once it grows, the browser itself
scrolls the whole row -- rail included -- because there is nothing else to scroll. The rail's own
internal parts (`<ul className="... overflow-y-auto">`) had always been built correctly for a
fixed-height shell; the shell just never gave them one. It is `h-dvh overflow-hidden` now, with
`<main>` carrying `overflow-y-auto` as the one thing that actually scrolls -- the change the
composer's own `KNOWN-GAPS.md` row already named as its prerequisite.

Checked against every `position: sticky` and `IntersectionObserver` use in the app. Most needed
nothing: table headers, the wizard's and composer's own sticky footers, and the channel feed's
read-marker all name no explicit scroll root, so `sticky` simply sticks to whichever ancestor is
now the scrolling one, and an unrooted `IntersectionObserver` still clips its target against
every ancestor's own `overflow` regardless of which element that turns out to be. Settings' own
section nav (`SectionNav`) was the one exception, and it took a second pass to find: it named an
explicit offset, `sticky top-14`, sized to clear the app header when the two of them shared one
scroll box. Once the header moved outside `<main>`'s box entirely, that offset became a header's
height of *dead space* between the real header and this nav's stuck position, rather than the gap
disappearing -- the nav is `sticky top-0` now, flush against whatever is actually above it, which
after this change is nothing it needs to clear at all.

**Settings and Profile needed a click before they would scroll, because the account menu never
actually closed when you chose one.** Base UI's `Menu.LinkItem` defaults to `closeOnClick={false}`
-- deliberately, so a modifier-click can still open the link in a new tab without the menu
snatching itself shut first. But every link in this menu navigates in the same tab, and a menu
that is still "open" as far as its own state is concerned keeps the scroll lock it applies to
`<html>` for as long as it is open -- so the lock outlived the navigation, and only cleared once
some unrelated click counted as dismissing it. `closeOnClick` now defaults to `true` on this
app's own `MenuLinkItem` wrapper, which is the right default for every current use (Profile,
Settings) and can still be overridden the day a link-like menu item genuinely wants to stay open.

## `quietLinkHover`: a real hover for a link that is already underlined

**A cross-reference in running text -- which company a deal is with, where a meeting is, a
website -- is underlined permanently, not just on hover.** Constant underline is deliberate: it
is a link you need to notice while scanning, not one you find by accident with the cursor. But a
handful of these, copy-pasted across a dozen pages, never got a real hover state to go with it:
some had none at all, one had `hover:text-fg-default` sitting on a link that was already
`text-fg-default` -- a hover that changes nothing, which reads as no hover at rest and looks like
the bug the checked-in class list claims it isn't.

**Two constraints ruled out the obvious fixes.** There is no neutral bolder than `fg-default` to
hover into -- it is already the boldest token this app has, so "make it stand out more" has
nowhere to go. And the brand accent (`#FF3B22`) is reserved for primary action, active nav,
destructive action, and blocked/overdue -- "you are hovering a link" is not a fifth meaning to
give it, even briefly. `hover:opacity-*` was rejected too, on the same reasoning the account
menu's own trigger was built against: dimming a control that contains text is a contrast failure
wearing a hover state, not a hover state.

**The fix is `quietLinkHover` in `styles.ts`: the same quiet background every other secondary
control in this app already hovers to** (`bg-surface-hover`, used in forty-odd other places),
with padding balanced by a negative margin so it does not nudge the words sitting next to it in
the sentence. Applied everywhere the pattern was missing it, plus the two other unrelated gaps
the same sweep turned up: the composer's own "preview" tab-link, and Today's whole
`UnplannedBanner`-as-a-project-link, which had no hover of any kind because the card inside it
already owns a border and a background -- that one gets `group-hover:border-border-hover`
instead of a second layer of background on top of the first.

## Reassigning a task or deliverable is a manager's call, not the assignee's

**`mayWorkOn` answers "may this person move this piece of work along" -- start it, complete it,
report or clear a blocker on it -- and until now `assignTask` used the exact same gate. That
conflated two different questions.** Doing the work and deciding who holds it are not the same
authority: the person a task is handed to should not also be the one who can hand it to someone
else, any more than a contributor on a project should be able to hand their own tasks off
unilaterally. The population that may change *who* a task or deliverable belongs to is narrower
than the population that may work on it -- `atLeast(actor, "manager")`, full stop, with no
assignee-of-record or project-lead exception.

**The same rule reaches task *creation*, not just reassignment.** Letting a member create a task
already assigned to someone else was the same authority through the back door -- so a
non-manager's `createTask` now always assigns to themselves regardless of what the form carries,
and the assignee field is not shown to them at all (`new-task-dialog.tsx`), the same treatment
`new-task-dialog.tsx` already gave non-project personal tasks. Deliverables get the identical
split: `createDeliverableAction` self-assigns for a non-manager, and `updateDeliverableAction`
leaves the existing assignee exactly where it was rather than trusting the submitted value --
editing your own deliverable's title or stage should not be blocked outright just because the
assignee field is locked, so the fix is to ignore that one field's submission, not refuse the
whole edit.

**The task drawer and the deliverable dialog both keep the picker for a manager and swap in a
read-only value with a one-line note for everyone else** -- including someone who can otherwise
work the task, so the locked field reads as deliberate rather than broken next to buttons that
are still active.

## Dark theme's hover was a no-op: `--surface-hover` equalled `--surface-raised`

**Every hover on a card in dark theme -- a task row, a project row, a person in the People
directory -- did nothing, because `--surface-hover` and `--surface-raised` had been the exact
same primitive (`--neutral-900`) since dark theme was first written.** `quietLinkHover` and the
hover sweep earlier in this file both assumed `bg-surface-hover` was a visible step away from
whatever it sat on -- true in light theme (`raised` is `neutral-0`, `hover` is `neutral-50`) and
silently false in dark, so every one of those fixes was invisible for anyone on dark theme, which
is this app's default. A token bug, not a component bug -- nothing to redo in any of the
components that already reach for `bg-surface-hover`/`hover:bg-surface-hover`.

**Fixed to `--neutral-850`, one step lighter than raised** -- mirroring light theme's own
one-step move, in the opposite direction because dark surfaces get lighter as they gain
elevation rather than darker. `--neutral-850` is not an arbitrary choice: it is already
`--surface-overlay`'s value, called out elsewhere in this file as "the lightest dark surface"
because `--fg-subtle` text on it already sits at the edge of AA. There is no lighter step to give
`--surface-hover` without failing that contrast check, which is also why `--surface-active`
stays exactly where it was rather than taking a second, lighter step of its own -- hover and
active now share a lightness in dark theme, which reads as one quiet highlight rather than two,
and is still a real improvement over hover doing nothing at all.

## Today's "New task" can now also attach to one of the member's own projects

**The Today page's own "New task" button always created a personal to-do, `projectId: null`,
with no way to point it at a project instead -- a separate feature from the per-project "New
task" on a project's own Tasks tab, and easy to confuse for the same thing.** A member reaching
for the Today button because it is the first "add a task" affordance they see got a task nobody
else's page would ever show.

**Fixed by giving the dialog an optional project picker, offered only from Today.** Left on its
default "Personal to-do" option, nothing changes. Pick one of the member's own projects (leads
and contributors only -- the same population `mayWorkOn` already lets add a task, and the same
list `listWorkableProjectIds` already builds for the sidebar's silo) and the task is filed under
it exactly as if it had been added from that project's own Tasks tab, assignee rule included: a
manager picking a project gets the assignee field, a member does not. `createTask` re-checks
project membership on the server regardless of what the picker happens to offer, so this is a
convenience, not a new door.

## Status and access change notifications, put to sleep on request

**A project's stage moving notified every member of it, and a member's role changing notified
them directly -- both by design, both now switched off.** Requested as a temporary quieting of
the inbox, with an explicit "later we may activate it," not a judgment that either notification
was wrong to build. `NOTIFY_STATUS_AND_ACCESS_CHANGES` in `src/lib/data/notifications.ts` gates
both `case`s in `recipientsFor` -- set to `false`, the recipients logic for each stays exactly as
it was, just short-circuited before it runs, rather than deleted and left to be re-derived later.
See `KNOWN-GAPS.md`.

**Only the personal inbox and the corner toast are affected.** Both events still write to
`activityEvents` exactly as before, so a project's own Activity tab and any channel that
surfaces its activity are untouched -- this is about what lands in one person's queue, not
about whether the event happened.

## Resizable containers: a personal layout preference, clamped, in `localStorage`

**The Today coordination queue's four columns and the People directory's table columns can now
be dragged to a different size** -- a divider between two panes, `role="separator"` plus arrow
keys (the "window splitter" pattern), rather than a mouse-only affordance. Both are clamped: the
queue's columns between 220px (still worth reading) and 560px (would otherwise swallow the row);
the table's between 90px (still enough for a badge) and 480px (a column should never own the
whole table). "Reasonable size" was the request -- these numbers are that made concrete, not a
user-configurable setting of their own.

**Only the first n-1 panes carry an explicit width; the last always fills whatever is left.**
The alternative -- redistributing every pane's width whenever one changes, so the row's total
stays constant -- is the shape a spreadsheet uses, not a sidebar or an editor pane, and it means
widening one column always narrows a specific *other* one, which is a harder mental model than
"the last column is where the slack goes." Same shape in both places: `ResizableQueueColumns`
for Today, `PeopleTable`'s own column widths for the directory.

**Widths live in this browser's `localStorage`, not the database.** This is what somebody's
screen looks like, not organization data -- nobody else's queue or directory should reflow
because one person likes a wider Name column. Read through `useSyncExternalStore` rather than a
`useState` seeded in an `useEffect`, the same reason `sidebar.tsx`'s own collapsed-sections state
already uses it: the server has no opinion on a value that only exists in this browser, and a
`useState`/`useEffect` pair for that is exactly the cascading-render shape the `react-hooks`
lint rule now catches. A drag in progress is ordinary local state for per-pixel feedback; only
release commits it to storage and the event every reader of that key is listening for.
