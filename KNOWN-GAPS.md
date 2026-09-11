# Known gaps

Things that are deliberately not done, not finished, or not verified — and what it would take to
close each one.

This file exists because the same three caveats were repeated at the end of five milestones in a
row and were in danger of becoming background noise. A gap that gets mentioned every time and
written down nowhere is a gap nobody ever fixes.

**Update this file in the same commit as the work.** Add a row when something is deferred, and
delete the row when it is closed — do not leave a struck-through list of things that are actually
finished. `CLAUDE.md` points here for the same reason.

Last reviewed: after the Mediast rebrand and the itemised devis.

---

## How this file is arranged

Four sections, because for a long while there was one -- headed *"Accepted, with a reason"* and
claiming everything under it was deliberate and not planned to change. That stopped being true
somewhere around the third milestone, and by the fourth it was actively misleading: most of what
had accumulated was ordinary unfinished work.

- The two **Asleep** sections are features deliberately put down rather than gaps waiting to be
  filled. `DECISIONS.md` says why for each, and what should wake it. Nothing in them is being
  worked on, and that is the point of listing them apart.
- **Not done yet** is real work nobody has done. Each row says what it would take, so none of them
  has to be thought through from scratch.
- **Deliberate, and not planned to change** is the section the old heading described: decisions,
  here so nobody rediscovers them and files them as bugs.

A new row goes in whichever of the four it belongs to. If it is not obvious, it is *Not done yet* --
that is the honest default, and the one the old file got wrong by assuming the opposite.

---

## Asleep: everything downstream of email

There is no SMTP server on this deployment and there is not going to be one -- see
`DECISIONS.md`. Invitations and password resets are finished features without it: the outbox
holds the message and an admin passes the link on. What is asleep is everything that would
assume a message reaches somebody on its own.

These wake up if this moves to a VPS, and not before. Somebody asking for reminders is not a
trigger -- the honest answer to that today is that the app cannot send them.

| Thing | Why |
|---|---|
| Nothing drains the mail queue on its own | There is no scheduler, so the only two things that ever move a message are queueing one and pressing retry in the outbox. On the default driver nothing is being delivered anyway, so this only starts to matter the day `MAIL_DRIVER=smtp` is set -- at which point it wants a cron, or a queue worker, or Vercel-style scheduled route. |
| Emails are plain text | No HTML, no branding, no logo. Deliberate to begin with -- an HTML email is a rendering project with its own testing problem, and every client interprets it differently -- but it does mean an invitation from this app looks like a note rather than like the studio. |
| Nothing knows whether a message actually arrived | `sent` means it left this machine. There is no bounce handling and no delivery receipt, which would need a mailbox to read and a webhook to receive. |
| Nothing reminds anybody to record a figure | A key result nobody measures shows as "not measured" forever, and the only thing that surfaces it is somebody opening the screen. A nudge needs the scheduler and the mail transport this deployment still lacks -- the same two things four other gaps wait on. |
| Nothing chases an overdue review | The list shows what is stale and that is the whole mechanism: somebody has to open the screen. No email, no inbox notification, no digest. Needs the mail transport, like everything else on this list that wants to reach somebody who is not already looking. |
| Nothing reminds anybody to hold a review | The screen lists the weeks that were skipped and that is the whole mechanism -- somebody has to open it. A Monday nudge needs the scheduler and the mail transport that five other gaps also wait on. |
| Nothing chases an overdue invoice | The invoices list marks what is past its due date and no further. No reminder goes out, to the client or to anybody here, because both would need a mail transport. |
| Nothing chases an overdue task or an at-risk project | `isOverdue()` and the buckets on Today and the coordination queue show what has slipped, and that is the whole mechanism -- somebody has to open the screen. No email, no inbox notification, no "your project's deadline passed" digest, and no escalation to the project's lead. Raised directly in the conversation that added the state gate; deliberately left as its own plan because it needs the scheduler and mail transport that half a dozen other gaps also wait on, plus a decision about who hears about it (the assignee, the lead, the whole team) and how often. |
| No external calendar, and no invitations by email | Nothing exports `.ics` and nothing syncs with Google or Outlook, so a meeting booked here is invisible to anybody's phone. The invitation reaches people through the inbox, in the app. Both halves need a mail transport, which this deployment still does not have. |
| No reminders | Nothing tells you fifteen minutes beforehand. Today shows what is next when you look at it, which is not the same thing. Needs either a scheduler or push, neither of which exists yet. |
| Notifications are in-app only | No email, no push. Both need a mail transport, which this deployment does not have. Inbox was the milestone that would have brought one and did not -- it turned out to be a separate piece of infrastructure, not part of the feature. |

---

## Asleep: file storage

Deferred deliberately, and written up in `DECISIONS.md`. The storage was never the hard
part -- a directory in the Compose volume needs no hardware. What is missing is a backup
story, a retention rule and anything bounding disk growth, and holding somebody's only copy
of a signed contract without those is worse than not holding it.

Each of these keeps an honest shape in the meantime: a reference rather than a receipt, a
step rather than a diagram. They wake up when somebody asks twice, or when the deployment
moves somewhere with backups.

| Thing | Why |
|---|---|
| A procedure has no attachments and no images | Steps are text. A procedure that needs a diagram, a template file or a screenshot cannot hold one, which for a creative agency is a real limit -- "here is the frame we shoot" is a picture. It waits on the same file storage a receipt, a signed proposal and a channel attachment all wait on. |
| An expense has a receipt *reference*, not a receipt | A string somebody types, because there is nowhere to put a file. The same gap blocks a signed proposal on a deal and an attachment in a channel: this deployment has no file storage, and picking one is a decision about backups as much as about uploads. |
| No threads, no mentions, no attachments, no reactions | Each is a feature in its own right rather than a corner of this one. Mentions are the first that matters, because they are the reason a message would ever belong in the inbox -- see the note in `src/lib/data/channels.ts`. |

---

## Not done yet

Real work nobody has done. Each row says what it would take, so none of them needs to be
thought through from scratch. Nothing here is deliberate -- if it were, it would be in the
section below.

| Thing | Why |
|---|---|
| A department cannot be archived, or given a lead | Renaming and describing one after the fact are closed -- `updateDepartment` and the edit dialog on each row in `DepartmentsPanel`. What is left: the schema already carries `leadUserId`, and `archivedAt` already exists (`listDepartments` already filters it out), but nothing writes to either yet. |
| `NEXT_PUBLIC_BASE_PATH` is only verified by hand | A sub-path deployment was built, then walked end to end against a real build -- sign-up, sign-in, page-to-page navigation, a PDF download, the channel stream -- but that walk lives in this session's notes, not in the automated suite. Nothing re-checks it on a change to routing, redirects, or the print/PDF paths. Worth a second Playwright project that runs the same specs against a build with the variable set, if this sees much use. |
| The tour cannot be replayed | Once it is finished or skipped it is gone, and there is no "show me that again" anywhere. The column is there and clearing it is a one-line action; what is missing is somewhere sensible to put the button, which is Profile rather than Settings and wants a line of copy nobody has written. |
| The tour describes the shell, not the work | Five steps about where things are. It says nothing about how to run a project, quote a job or close a review -- those would each want their own walkthrough on their own screen, triggered the first time somebody opens it. Worth doing one at a time, if anybody actually gets lost there. |
| The tour is the same for everyone | A designer and the person who sends the invoices see different rails, and both are told "five places". The steps are not filtered by what that person can actually reach, which is a small lie on the two rails that differ. |
| The letterhead can only be changed in the database | Tagline, city, website and contact email are columns on `organizations` and are set by the seed. There is no form in Settings, so changing what prints on every quote means a SQL statement. The fields are nullable and the sheet omits what is absent, so this is a missing screen rather than a broken document. |
| The document cannot be emailed from the app | There is now a real PDF to attach, so what is left is the outbox side: messages carry no attachments, and the email work is asleep by decision. Until then you download it and attach it yourself. |
| The logo is a URL, not an upload | Mediast's own wordmark now ships as `public/brand/mediast-wordmark.svg` and `organizations.logo_url` points at it -- same-origin, so it shows on both the interactive print view and the server-rendered PDF, which deliberately blocks every network request outside the app origin. What is still missing is a way for an organization to set or change this for itself: today it is a file in the repo and a column set by a migration, with no upload and no settings screen. An externally hosted URL would still be blocked from the PDF specifically, for the reason above, until file storage or a controlled image proxy exists. An organization with no logo set still prints its name in brand red. |
| The 503 when no browser is installed is untested | The code path is there and returns a plain-text explanation pointing at the Print button, but nothing exercises it -- proving it would mean a test run with Chromium removed, which is a second image rather than a second test. It is the one branch of the PDF route that has only been reasoned about. |
| A long quote runs to a second page, and nothing says so | The sheet is designed as one sheet and the seeded document clears A4 by about 7mm. Add a third line with bullets, or a wordy set of conditions, and it spills -- correctly, but silently. Nobody writing a quote is told they have just made a two-page document, and no test guards any quote but the seeded one. |
| The line editor has no preview | The bullets are typed into two textareas and are next seen on the finished sheet. What the reference devis makes obvious -- that this is prose on a page, and that three long bullets cost a line item its place on page one -- is invisible while it is being written. |
| The seeded cast still has @brandshift.test addresses | Demo data only, and the e2e fixtures hard-code them, so renaming is a mechanical change across `seed-data.ts`, `e2e/people.ts` and every spec that signs in. Recorded so it is read as unfinished renaming rather than a second company. |
| The outbox keeps message bodies forever | Including invite links, which set passwords. They expire, and anybody who can read the outbox can already invite people, so it grants nothing new -- but there is no pruning, and a year of notifications will sit there. Wants a retention rule the day notifications start being emailed. |
| No email, no calls, no attachments on a deal | A deal has notes and a channel. There is no logged call, no email thread and nowhere to put a signed proposal. Email needs the mail transport this deployment still lacks; files need somewhere to put them. |
| No rate limiting on sign-in | Single-tenant on a local network. Sign-in already resists account enumeration (one message for both halves, and a dummy hash verified when no user matches), but nothing throttles guesses. Worth adding before this is ever exposed beyond the LAN. |
| Notifications have read state but no archive | Read and unread cover the core of an inbox. A third state is worth adding when somebody actually wants to keep a read item out of the way, not before. |
| A won deal does not become a project | Nothing converts one into the other, so the handover from selling the work to doing it is retyping. It is the obvious next thing and it is a decision about what carries across -- the team, the deliverables, the dates -- rather than a button. |
| The old app's attendance, lunch records and DMs have nowhere to land | The migration counts and reports them rather than carrying them: there is no timeclock here, and no one-to-one messages. The rows stay in the old Mongo, which is not being deleted. If any of it turns out to matter, it has to become a feature here first -- see the timesheet row above. |
| Nothing verifies a completed migration beyond the report | The run prints what it wrote and the counts were checked by hand against Mongo during the rehearsal. There is no second pass that re-reads both databases and asserts they agree. Worth writing the day this has to be done against data nobody has profiled first. |
| The login page logs a hydration mismatch in dev | Seen in `next dev` during the migration rehearsal: "some attributes of the server rendered HTML didn't match". It is on `/[locale]/(auth)/login`, unrelated to the migration, and no test catches it because Playwright does not fail on React warnings. Nothing visibly misbehaves, which is exactly why it has survived. Worth chasing with the dev overlay open. |
| Prettier is not wired into anything | There is no config and `npm run lint` does not check formatting, so the 100-column style everything is written in is a convention held up by hand. Adding a config now reformats 106 files, which is not a diff worth mixing into feature work -- it wants its own commit. |
| The Notion workspace is in; the empty parts of it are still empty | `db:import:notion` carried the SOP Library (12 procedures), the Projects (22), Tasks (39), Team responsibilities (7) and the free-standing pages -- the Mr Dyaf dossier, the HQ/wiki pages, the templates -- into `sops`, `projects`, `tasks`, `memberships.jobTitle` and `documents`. Notion is retired; there is no sync. The Clients, CRM Commercial, Objectives & KPI and Weekly Reviews databases were empty in the export, so no company, KPI or weekly-review content came across, and none was invented. Page covers, icons and attachments were not carried -- attachments wait on file storage (own row above). |
| The imported SOPs and documents have no owner or department; imported projects have no owner | All written as null. The Notion "Owner" on an SOP is a role title ("Marketing Manager", "Production Lead"), not a person or department here; the SOP-owner and project-owner relations point at Team pages, not `users`. Team names that matched a real member by first name got their responsibilities line (`jobTitle`); the rest are reported by the importer. Set owners and departments by hand, or teach the importer a name map. |
| Imported tasks have no assignee and imported projects have no members | The Notion "Responsable" on a task points at a Team page, not a `user`, so every imported task lands unassigned and no `project_members` rows are created. The pipeline board and the project pages work regardless; assigning is a pass over the boards once the team is settled. |
| Key results cannot be edited or removed after creation | Title, unit, direction, start and target are set once from the dialog. Correcting a typo in a target means closing the objective and making another. Worth wiring to an inline edit, with the caveat that changing a target after checkpoints exist silently rewrites the progress history. |
| Objectives do not link to the work that moves them | No relation to a project, a task or a deal, so "what are we actually doing about this" is answered by reading both screens. It is the obvious next relation, and it is a decision about which direction the link points rather than a column. |
| A shared `DialogClose render={<Button>}` logs a Base UI warning | "A component that acts as a button expected a native `<button>`" appears in `next dev` on every screen using that pattern -- `/en/leave` and `/en/objectives` were both confirmed, so it predates this milestone and lives in the UI kit rather than in any one feature. Dev-only, nothing visibly misbehaves, and no test catches it because Playwright does not fail on React warnings. |
| A `Button render={<Link>}` logs the same Base UI warning | `button.tsx` briefly inferred `nativeButton={false}` for any `render` prop carrying an `href`, to quiet exactly this warning. Reverted: `nativeButton: false` makes Base UI inject `role="button"` onto the rendered element, which overwrote the real `role="link"` on every Button-as-Link (the "New quote" trigger, the Print control, `sheet.spec.ts`'s and `finance.spec.ts`'s link assertions all broke against a live build). Correct accessible semantics is worth a dev-only console line; the audit's fix had the trade the wrong way round. |
| A procedure has no history and no versions | Editing the steps replaces them. There is no record of what a procedure said last year, which matters exactly when somebody asks why a job was done the way it was. `replaceSteps` is written so this becomes a real diff rather than a rewrite. |
| Only title, summary and steps can be edited after creation | Owner, department and review interval are set once from the dialog. Changing them means creating another procedure, which is heavy-handed for fixing a typo in the interval. |
| A procedure links to a stage, not to a specific project | `sops.stage` ties a procedure to a delivery-flow stage, so a project sitting in `production` surfaces the production procedure -- but there is still no relation from one procedure to one project, and no project-to-procedure list. Good enough while every client runs the same flow; the day one client needs a bespoke procedure, that is a join table. |
| The pipeline board is last-write-wins, like the task board | Two people dragging the same project between stages at the same moment: the second write silently wins. Same shape as the task-board row above, and not attempted here for the same reason -- it wants a version check, not a guess. Rarer than the task board, since a project has one stage and few people move it. |
| Nothing advances a project's stage automatically, and setup is a button | Moving between stages is a manual drag or select, and instantiating a stage's playbook is the "Set up this stage" button -- nothing fires either when the last task of a stage is done. That trigger is a smarter pass than Phase 2 took; it is deliberately not auto-firing on stage change, which would double up on a back-and-forth move. |
| A stage's setup cannot be re-run after its template changes | `project_stage_setup` marks a stage done for a project and the button then disappears. If the stage's template or expected documents change afterwards, there is no "refresh this stage" -- you add the missing tasks by hand. A reset path wants a decision about what happens to the tasks already created (and possibly started) from the old template. |
| The playbook is one flow for the whole organisation | `stage_playbook` has one row per stage, no per-department or per-client-type variant. Right while every client runs the same eight stages; the day one client-type needs a different flow, it is a `playbooks` table and a picker on the wizard. |
| Deliverables show only on their project | The Deliverables tab is the only place they appear -- not on Today, not on the pipeline board, no cross-project "everything with the client" view. Fine while a person works one project at a time; the day someone is juggling five, they want the list. Each is a read against a table that already has the right index. |
| Converting a task to a deliverable is one at a time, and irreversible | `convertTaskToDeliverable` deletes the task; there is no batch convert and no "turn it back". The imported Notion tasks that are really deliverables get converted by hand from the tab. A batch path wants a preview of what it would move; an undo wants a decision about the deliverable's accumulated history. |
| A deliverable's client feedback is one field, overwritten each round | Moving into `revising` sets `client_feedback` to the latest note; the previous round's is gone. Real revision cycles have a history -- round one asked for X, round two for Y. That is a `deliverable_revisions` child table when somebody needs to see the thread. |
| A template cannot be started from the project wizard | The five-step wizard and "start from a template" are two separate ways to create a project, and somebody who begins in the wizard has no way to reach a template from there. Merging them means deciding whether the template pre-fills the wizard or replaces it, which is a design question rather than a wiring one. |
| Only the tasks can be edited after a template is created | Name, description and department are set once. Changing them means making another template. |
| Nothing tracks which template a project came from | A project started from a template keeps no reference to it, so "is this template actually any good" cannot be answered, and improving a template does nothing for the projects already running on it. A column and a decision about whether changes propagate. |
| A retired template stays retired with no way back in the UI | `archiveTemplate` sets the date and nothing clears it. The SOP library has a restore path and this does not, which is an inconsistency rather than a decision. |
| A decision cannot become a task | It has an owner and a date and lives only on the review, so it is not on anybody's Today and nothing chases it beyond the reviews screen. Turning one into a task means choosing a project, which is a small design question rather than a wiring one -- and it would make the fourth path in this app from a definition to a task. |
| A review covers the whole organization, never a department | One review per week for everybody. A studio that grows two teams that do not overlap will want one each, which is a column and a decision about who sees whose. |
| The snapshot cannot be recomputed after publishing | Reopening a published review clears the frozen figures and recounts from scratch, which is right, but there is no way to say "keep the write-up and refresh the numbers". Rarely wanted; noted because the first person to want it will not find it. |
| No credit notes | An invoice can be voided in full and nothing can be reversed in part. A real credit note is its own numbered document that points at the invoice it corrects, and the arithmetic already handles negatives -- `roundHalfAwayFromZero` exists for exactly this. What is missing is the document and its number series. |
| Invoices do not repeat | No retainer, no monthly. An agency on a retainer creates the same invoice twelve times a year by hand. It is the same shape of problem as recurring meetings -- a rule, an exception model, and a decision about how far ahead documents exist -- and it is worth building deliberately rather than adding a `repeat` column. |
| A document cannot be edited once it exists | Lines are set from the dialog and never changed, not even on a draft. Void and re-create is the only correction, which is right for an issued invoice and heavy-handed for a draft with a typo in it. Editing a draft is worth adding; editing an issued document is not. |
| Payments are typed in, and nothing reconciles them | Somebody reads the bank statement and records what arrived. There is no bank feed, no matching, and no way to notice that a payment was recorded twice. Right at one agency's volume; the first thing to want at ten times it. |
| Anybody with `finance` can mark an expense reimbursed, including their own | There is no approval step on money out, in the way there deliberately is on leave. It was left out because an agency this size reimburses on trust and an approval queue nobody uses is worse than none. It becomes wrong the day somebody who is not the person paying can file one. |
| No tax report, and no accounting export | The tax on every line is stored exactly, and nothing adds it up for a quarter or hands it to an accountant. Both are a day's work each and both need somebody to say which format their accountant actually wants -- which is why neither was guessed at. |
| Money on a project is quoted, never actual | An invoice can point at a project; no cost ever does. There is no budget, no time recorded against the work, and so no answer to "did we make anything on this". That needs the timesheet the leave milestone also wanted, and it is the real reason to build one. |
| A deal does not become a project directly | It becomes a quote, and an accepted quote becomes a project with a task per line. The handover exists and the retyping is gone; what is still missing is the short path for work that was never quoted. |
| Contacts have no page of their own | A contact is a name, a job title and two ways to reach them; everything else about the relationship lives on the company or the deal. It becomes a page the day a contact needs its own history. |
| Insights has no date range and no export | Twelve weeks, always, and no way to send it to anybody. A range picker is easy; an export means deciding what "export" means -- CSV of which table, or a document. Worth doing when somebody asks for a specific one. |
| Nothing on Insights is per-department or per-client | Everything is the whole organization. Departments exist and would be the obvious first cut, but a filter that only ever has one useful setting is a control nobody touches. Worth adding when there is a second thing to compare. |
| Public holidays are not modelled | A week off over Christmas costs five days here and four in reality, and the same is true of every national holiday. Doing it properly means a holiday calendar per organization -- and probably per country, once anybody is hired abroad. A hardcoded list of one country's holidays would be worse than the gap, because it would be wrong silently. |
| Leave allowances do not accrue, carry over or pro-rate | Everybody gets their full annual allowance on 1 January, whatever month they joined and whatever they did not use last year. Real HR policies do all three, and each is a rule an organization would want to set for itself. The allowance is a single number on the membership until somebody needs more. |
| There is no timeclock and no timesheet | Attendance here means who is away, derived from approved leave. Nobody clocks in, and no hours are recorded against a project. Billable hours are a real want and belong next to ERP invoicing, where the invoice that consumes them lives. |
| Anybody who can approve can approve anybody | There is no approval chain and no "your manager decides". Every manager, admin and owner -- plus anybody holding the `people` module -- sees the whole queue. Right for one studio; wrong the day there are two departments that do not overlap. |
| A leave request has no page of its own | It is a row on the time-off screen, which is where both halves of the conversation happen, so a notification about one lands on the list rather than on the request. Fine while the list is short. |
| Meetings do not repeat | No recurrence, and so no "every Monday". It is the single largest thing missing here, and it is a feature in its own right: a recurrence rule, an exception model for the week somebody moves, and a decision about how far ahead instances exist. Worth building deliberately rather than bolting a `repeat` column onto this. |
| Free-busy is checked, not displayed as a grid | The guest list tells you who is booked at the slot you have chosen. It does not draw everybody's day so you can find a slot that suits all of them. The first is what stops a mistake; the second is a different screen. |
| One timezone -- the organization's | Every time on every screen is the studio's clock. Right for an agency in one place; wrong the day somebody is hired in another. The conversion is already in one function (`calendar-dates.ts`), so this becomes a per-person preference rather than a rewrite. |
| A channel loads its last 100 entries and no further | No infinite scroll and no "load earlier". A hundred entries is several weeks of a real project channel, and the project's Activity tab holds the full history. Paging back is worth building when somebody actually runs out. Deliberately skipped in the pass that added pinning and collapsible sections below: `readChannelFeed` merges messages and project activity into one sorted list before paging, so "load earlier" means paging both sources together, not one query -- a real piece of work, not a quick addition alongside three small ones. |
| No DMs, threads, mentions, reactions, or message search | Each is a real feature, not a corner of the channel this app already has. `channels.kind` is only `project \| deal \| general` -- there is no way to message one person. Sized and ranked (DMs first, then mentions, then threads, then reactions/search) after a request to compare this app to Slack; none were built, because doing any of them to this app's own standard -- both locales, e2e coverage, the full gate -- is realistically each its own milestone, not something to fit alongside three sidebar changes in an hour. |
| The board has no protection against two people editing it at once | Save writes whatever the browser last computed a diff against; two people dragging cards on the same project's board at the same moment is last-write-wins, with no warning to either. Real at a studio big enough to have two people planning the same board simultaneously, and not attempted here -- it wants a real design (a version check, at minimum) rather than a guess bolted onto the first version of this feature. |
| An admin can request to join a channel and then approve their own request | Found while testing channel join requests. `leave.approve` explicitly excludes the requester's own row ("never your own request, whatever your role") -- `channel.manageMembers` does not carry the same exclusion, since an admin is already trusted to approve *anyone's* request and self-approval grants nothing an admin couldn't already do for someone else. Named so it reads as a considered gap rather than an oversight nobody noticed; worth closing the day it actually confuses somebody. |
| Today's own coordination queue still checks `atLeast(actor, "manager")` inline instead of `can()` | Found while gating the new `/work/queue` page, which does it the formal way (`task.viewQueue`). Today's `CoordinationQueue` branch predates that rule and was left alone rather than risking an unrelated change to the page every manager opens first -- both checks agree today, so nothing is actually wrong, but a rule that exists in two places can drift, and only one of them is the one `CLAUDE.md` says permission rules live in. |

---

## Deliberate, and not planned to change

Decisions rather than omissions. They are here so nobody rediscovers them and files them as
bugs, and so the argument does not have to be had twice -- most are set out at length in
`DECISIONS.md`.

| Thing | Why |
|---|---|
| The `sessions` digest check runs in the page, not the middleware | A database round trip in front of every request, including static assets, is a bad trade. `requireUser()` does the full check on every render of the `(app)` layout, so a revoked session still cannot see a page. Written up in `DECISIONS.md`. |
| No route under `(app)` has its own `loading.tsx` | Tried, and reverted: any `loading.tsx` anywhere in the tree -- even in a leaf folder with no `notFound()` call -- wraps that segment in a Suspense boundary, and Next commits the HTTP status to 200 the moment that boundary starts streaming. `(app)/layout.tsx` calls `requireUser()`, an *ancestor* of every loading.tsx, so this silently turned a revoked session's 401 and a bad id's 404 into a 200 with the right-looking page underneath -- confirmed against both `not-found.spec.ts` and the "session revoked from another device" test, which is what caught it. A per-route skeleton needs the session check moved into middleware first (the row above explains why that has not happened); until then a loading skeleton and a correct status code are mutually exclusive on this layout. |
| The command palette loads its whole index | A few dozen projects, people and departments. Filtering in the browser is faster and steadier than a request per keystroke. It becomes a server search behind the same `PaletteEntry` shape when an org outgrows it. |
| The People list sorts and pages in memory | `selectJoined()` ends at `where` so the tenant filter is always last. At directory scale the difference is not measurable; if it becomes so, the sort and limit move into the helper rather than into each caller. |
| `cancelled` tasks appear in no bucket | Neither open nor complete. Work someone decided not to do belongs in neither queue; it is still reachable from the project board. |
| The e2e suite runs serially, on one database | It completes tasks and publishes projects, so parallel workers would race each other through shared rows. One worker takes about a minute, which is not worth engineering around yet. |
| axe covers WCAG 2.1 A and AA, not its best-practice rules | Those are opinions worth reading and not worth failing a build over. A suite that cries wolf gets muted, and then it catches nothing. |
| Holding `finance` costs you Insights and Pipeline on the rail | One rail per person and five slots on it, so the owner -- who holds every module -- reaches two of her screens through the palette. It is the honest consequence of the cap rather than a bug, and the alternative, a rail that grows with your permissions, is the thing the cap exists to prevent. It becomes worth revisiting if somebody who holds everything says the palette is not enough. |
| A migrated project keeps its old name even where the client was merged | `Obarfum - Content` still reads that way on a project whose company is now `Ô Bar'Fum`. The company is the row that matters and it is correct; renaming forty projects on a guess about how each name was built would be a worse trade. Rename them by hand if it grates. |
| Objectives are visible to everyone, with no private option | Deliberate, and recorded here so it is not filed as a bug: direction half the company cannot see is direction nobody pulls towards. It becomes wrong the first time somebody wants a goal about a person rather than about the work. |
| Starting a project from a template assigns nobody | Deliberate -- see `DECISIONS.md` -- but it does mean every project starts with a board of unassigned work, and the wizard's workload view is the thing that would fix it. The two want joining up. |
| A draft is visible to everyone, but only its numbers | Somebody without `review.manage` sees that the week is being reviewed and sees the figures, but not the half-written notes. That is deliberate -- working notes are not a record -- though it does mean a draft page is thin for most of the company. |
| The pipeline has no forecast, weighted or otherwise | Deliberate -- see `DECISIONS.md`. Recorded here so it is not filed as missing. What is genuinely absent is any view of the pipeline over time: won-per-quarter, average time to close, win rate by source. All three are real questions the data can already answer. |
| One currency per organization | ISO 4217 on the organization, and every figure -- deal, quote, invoice, expense -- is in it. Multi-currency is not a column: it is an exchange rate, the date it was taken on, and a decision about which of the two amounts an invoice is actually owed in. It stayed out of ERP for that reason rather than by oversight. |
| Insights counts in memory, not in SQL | Each figure is worked out from a few hundred rows pulled back whole, rather than a `date_trunc` and a `group by`. At one agency's volume the difference is not measurable, and the shape of each function is already the shape the SQL version would have. |
| A meeting is visible to the whole organization | Anyone signed in can read any meeting. There is no private meeting, which matters the first time somebody books a one-to-one about somebody else. The member silo does not touch the calendar -- a member still sees every meeting on it, including ones they are not in. Same for objectives and weekly reviews, which are org-wide by an earlier decision. Narrowing those is a follow-up, not part of the silo. |
| A member's channels are not narrowed by the silo | The silo hides a project's Activity tab from a member and filters its task and deliverable lists to their own. It does **not** touch channels: a member on a project channel still sees that project's activity interleaved into the feed, and can still browse and request to join channels for projects they are not on. Channels are their own pending redesign (see the note in `src/db/schema/channels.ts`), and that is where this gets addressed. |
| A handoff link is same-project only, and shallow-cycle-checked | `task_links` requires both tasks on one project -- a cross-project handoff (the edit on one client feeding a deck on another) would need a task search the drawer does not have. And only the *direct* reverse link is rejected on insert: A waiting on B, B on C, C on A is still possible. A topological check on insert closes it; at one agency's task volume nobody has built a three-deep cycle by hand yet. |
| Nothing nudges a handoff on its own | The Nudge button is manual: someone has to open the drawer and press it, and it is rate-limited to once every twelve hours. An upstream task that slips past its due date does not chase its downstream assignees automatically -- that wants the scheduler the overdue-task row above also waits on, plus a rule for how often is too often. |
| A member sees one task across the wall, through a handoff link | By design: a linked task shows its title, its status and its assignee's name even when it is on a project the member is not on, because "is the thing I am waiting on done, and who has it" is the question the handoff exists to answer. Recorded so it is read as the deliberate exception to the silo, not a leak in it. |
| "No plan yet" is read at screen-render time, not pushed | There is no scheduler, so nothing tells anyone the moment the grace period closes -- the fact only shows up the next time somebody opens their own project, their own Today, or the coordination queue. Same honest shape `isOverdue()` already has, and the same dependency half a dozen other gaps wait on. A pushed reminder at the 48th hour, and an auto-nudge on an unplanned handoff, are the same missing piece. |
| The planning threshold has no settings screen | `organizations.planning_grace_hours` exists so the 48-hour default can be tuned per organization, but changing it today means a SQL statement -- the same gap the letterhead fields in Settings already carry. Worth a field the day somebody actually wants a different number. |
| "No plan" does not check whether the work was ever theirs to plan | The rule is purely "a non-viewer project member with zero tasks assigned to them, past the grace period" -- it does not know whether the lead already planned the whole project and simply has not assigned this person anything yet, versus this person being expected to plan their own corner. Both read the same today. Splitting them is a decision about what a project's *shape* implies, not a query change. |
| The corner toasts can lag, and drop from a burst | `NotificationToasts` reacts to the shell re-render that `LiveSync` triggers, so a toast arrives a second or two after the notification and is subject to the same quiet-after-interaction gate. It also only pops what is in the fifteen most recent unread rows the layout hands it; more than fifteen new notifications between two refreshes and the older ones never toast -- they are still in the inbox, and the count on the rail is still right. |
| Presence is per process | It is derived from the SSE connections one container is holding, which is why there is nothing to expire and nothing to clean up after a crash. One container is what this deployment runs. The day it runs two, people on different containers will not see each other in the "here now" row -- messages still reach both, because those go through Postgres. Fixing it means shared state, which is a Redis nobody has yet. |
| The live stream is one SSE connection per open tab | The app-wide `/api/stream` (and the channel stream beside it) each hold one connection per tab. At a small team that is a handful; at N people with M tabs it is N×M held connections and N×M `router.refresh()` calls on every write, all on one container. A shared worker in the browser, or one multiplexed stream instead of two, is the move if this grows -- along with the per-process `LISTEN` becoming a bottleneck the same day presence does. |
| The live refresh fires on any change, not the one on screen | `LiveSync` refetches the current route whenever *anything* in the org moves, because knowing client-side whether the change touches what is rendered is harder than just refetching. A debounce and a quiet-after-interaction gate keep it bounded, but someone hammering tasks while you read Finance still costs you idle refetches. The payload already carries a `topic`; matching it against the route is the refinement, once there is a clean map from route to topic. |
| A rolled-back transaction still announces its write | `publishLiveChange` fires on a pooled connection, not the caller's transaction, matching `publishChannelChange`'s existing trade -- so a multi-statement action that rolls back has already sent its `pg_notify`, and everyone refetches once to find nothing changed. Rare (rollbacks are for genuine errors) and cheap (one wasted refetch). Routing the notify through the executor would make it transaction-correct and dedupe within the transaction, at one extra round trip per write. |
| The composer sits at the end of the column, not pinned to the viewport | Pinning it means the shell owning the scroll region -- `h-dvh` with `overflow-hidden`, and `main` scrolling inside it -- which changes the layout of every screen in the app. The unpinned version was chosen after the pinned one was seen to cover the newest message on desktop and land underneath the bottom nav on a phone. Worth revisiting as a shell change, on its own, with the responsive sweep watching. |
| `next start` logs "The destination stream closed early" on every navigation | Next's own message for a streaming response the client abandoned -- for SSE that is every navigation away, and there are now two streams per page (the app-wide `/api/stream` and, on a channel, its own). Each route closes its stream on both `cancel` and `abort`, and the log line still appears -- it comes from Next piping the response, not from the handler. Nothing leaks: the presence entry and both Postgres listeners are torn down. |

---

## Closed

Kept briefly so the same ground is not re-argued.

- **No end-to-end tests, and no Playwright** — closed by `e2e/`. 92 specs across sign-in, the
  401/403 split, the task drawer, the project wizard, locale switching, responsive widths and
  accessibility. They run against their own `brandshift_test` database, rebuilt each run, so the
  suite can never destroy the data you were working with. `README.md`, `ROADMAP.md` and
  `CLAUDE.md` had all told you to run `npx playwright test` since the scaffold, when it had never
  been installed; that is now true.
- **Responsive unverified below ~654px** — closed. Chrome clamps its own minimum window width,
  which is what had blocked this; Playwright sets the viewport directly. 320 / 375 / 768 / 1024 /
  1440 are all asserted not to scroll the page sideways, on every signed-in route, and the layout
  turned out to have been correct all along.
- **Accessibility enforced for colour only** — closed. axe runs on every route, both themes, and
  the states that only exist after an interaction: an open drawer, the command palette, and each
  of the three menus. It found four real faults on its first run, listed below.
- **`DEV_USER_EMAIL`** — the M3 stopgap that picked which seeded person the shell rendered as.
  Removed in M4 when real sign-in landed.

### What using it found

- **The 401 page had never once rendered.** `requireUser()` throws `unauthorized()` from inside
  `(app)/layout.tsx`, and `unauthorized.tsx` sat beside that layout -- but a boundary covers a
  segment's *children*, never that segment's own layout. So it caught nothing, and Next's built-in
  page rendered instead: "You're not authorized to access this page", which reads like a
  permissions refusal rather than an expired session. Moved one level up, to `[locale]/`.

  Two things kept it quiet for four milestones. The tests around it asserted what should *not* be
  on screen -- a heading absent, a session surviving -- and every one of those passed against the
  wrong page. And `curl` cannot tell the two apart: Next's default renders on the client, so the
  server sends the same bare shell either way, and only a real browser shows the difference.
  `e2e/anonymous/auth.spec.ts` now signs in twice, has one browser sign the other out, and names
  the words that must be on screen.

### What the first run found

Worth recording, because each one had survived a manual pass:

1. **Both the Language and Organization menus crashed the page when opened.** `Menu.GroupLabel`
   throws without a `Menu.Group` or `Menu.RadioGroup` around it. Shipped in M3 and never noticed,
   because the manual passes only ever opened the Account menu.
2. **The blocker field's label pointed at nothing.** `Textarea` was a bare `<textarea>`, so a
   `Field` around it wired up no `for`, no `aria-describedby`, and the control's only accessible
   name came from its placeholder — the exact fault the login page was rebuilt to fix.
3. **Nine text-on-surface pairs were below AA**, including `--fg-subtle` on any hovered row.
   `tokens.test.ts` had been checking a hand-picked list that never included the interaction
   surfaces. It now generates the full cross product, so a new surface or text level is covered
   the day it is added.
4. **Two hover states dimmed text under AA** — `hover:opacity-85` on the avatar trigger, and the
   loading button fading its own label to 70% (white on red, about 2.5:1). Fading a control that
   contains text is a contrast failure wearing a hover state.
