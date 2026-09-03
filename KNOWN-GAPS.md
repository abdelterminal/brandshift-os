# Known gaps

Things that are deliberately not done, not finished, or not verified — and what it would take to
close each one.

This file exists because the same three caveats were repeated at the end of five milestones in a
row and were in danger of becoming background noise. A gap that gets mentioned every time and
written down nowhere is a gap nobody ever fixes.

**Update this file in the same commit as the work.** Add a row when something is deferred, and
delete the row when it is closed — do not leave a struck-through list of things that are actually
finished. `CLAUDE.md` points here for the same reason.

Last reviewed: after Insights and reporting landed.

---

## Open

Nothing from the original three. The suite that closed them is `e2e/`, run with
`npm run test:e2e`.

New gaps go here as they appear.

---

## Accepted, with a reason

These are deliberate and are not planned to change. They are here so nobody rediscovers them and
files them as bugs.

| Thing | Why |
|---|---|
| The `sessions` digest check runs in the page, not the middleware | A database round trip in front of every request, including static assets, is a bad trade. `requireUser()` does the full check on every render of the `(app)` layout, so a revoked session still cannot see a page. Written up in `DECISIONS.md`. |
| Invites send no email | No mail transport exists yet -- see the notifications row below, which is the same gap. The invite dialog says so on screen rather than implying a message was sent. |
| The command palette loads its whole index | A few dozen projects, people and departments. Filtering in the browser is faster and steadier than a request per keystroke. It becomes a server search behind the same `PaletteEntry` shape when an org outgrows it. |
| The People list sorts and pages in memory | `selectJoined()` ends at `where` so the tenant filter is always last. At directory scale the difference is not measurable; if it becomes so, the sort and limit move into the helper rather than into each caller. |
| No rate limiting on sign-in | Single-tenant on a local network. Sign-in already resists account enumeration (one message for both halves, and a dummy hash verified when no user matches), but nothing throttles guesses. Worth adding before this is ever exposed beyond the LAN. |
| `cancelled` tasks appear in no bucket | Neither open nor complete. Work someone decided not to do belongs in neither queue; it is still reachable from the project board. |
| The e2e suite runs serially, on one database | It completes tasks and publishes projects, so parallel workers would race each other through shared rows. One worker takes about a minute, which is not worth engineering around yet. |
| axe covers WCAG 2.1 A and AA, not its best-practice rules | Those are opinions worth reading and not worth failing a build over. A suite that cries wolf gets muted, and then it catches nothing. |
| Notifications have read state but no archive | Read and unread cover the core of an inbox. A third state is worth adding when somebody actually wants to keep a read item out of the way, not before. |
| Insights counts in memory, not in SQL | Each figure is worked out from a few hundred rows pulled back whole, rather than a `date_trunc` and a `group by`. At one agency's volume the difference is not measurable, and the shape of each function is already the shape the SQL version would have. |
| Insights has no date range and no export | Twelve weeks, always, and no way to send it to anybody. A range picker is easy; an export means deciding what "export" means -- CSV of which table, or a document. Worth doing when somebody asks for a specific one. |
| Nothing on Insights is per-department or per-client | Everything is the whole organization. Departments exist and would be the obvious first cut, but a filter that only ever has one useful setting is a control nobody touches. Worth adding when there is a second thing to compare. |
| Public holidays are not modelled | A week off over Christmas costs five days here and four in reality, and the same is true of every national holiday. Doing it properly means a holiday calendar per organization -- and probably per country, once anybody is hired abroad. A hardcoded list of one country's holidays would be worse than the gap, because it would be wrong silently. |
| Leave allowances do not accrue, carry over or pro-rate | Everybody gets their full annual allowance on 1 January, whatever month they joined and whatever they did not use last year. Real HR policies do all three, and each is a rule an organization would want to set for itself. The allowance is a single number on the membership until somebody needs more. |
| There is no timeclock and no timesheet | Attendance here means who is away, derived from approved leave. Nobody clocks in, and no hours are recorded against a project. Billable hours are a real want and belong next to ERP invoicing, where the invoice that consumes them lives. |
| Anybody who can approve can approve anybody | There is no approval chain and no "your manager decides". Every manager, admin and owner -- plus anybody holding the `people` module -- sees the whole queue. Right for one studio; wrong the day there are two departments that do not overlap. |
| A leave request has no page of its own | It is a row on the time-off screen, which is where both halves of the conversation happen, so a notification about one lands on the list rather than on the request. Fine while the list is short. |
| Meetings do not repeat | No recurrence, and so no "every Monday". It is the single largest thing missing here, and it is a feature in its own right: a recurrence rule, an exception model for the week somebody moves, and a decision about how far ahead instances exist. Worth building deliberately rather than bolting a `repeat` column onto this. |
| No external calendar, and no invitations by email | Nothing exports `.ics` and nothing syncs with Google or Outlook, so a meeting booked here is invisible to anybody's phone. The invitation reaches people through the inbox, in the app. Both halves need a mail transport, which this deployment still does not have. |
| No reminders | Nothing tells you fifteen minutes beforehand. Today shows what is next when you look at it, which is not the same thing. Needs either a scheduler or push, neither of which exists yet. |
| Free-busy is checked, not displayed as a grid | The guest list tells you who is booked at the slot you have chosen. It does not draw everybody's day so you can find a slot that suits all of them. The first is what stops a mistake; the second is a different screen. |
| One timezone -- the organization's | Every time on every screen is the studio's clock. Right for an agency in one place; wrong the day somebody is hired in another. The conversion is already in one function (`calendar-dates.ts`), so this becomes a per-person preference rather than a rewrite. |
| A meeting is visible to the whole organization | Anyone signed in can read any meeting, as with projects and channels. There is no private meeting, which matters the first time somebody books a one-to-one about somebody else. |
| Presence is per process | It is derived from the SSE connections one container is holding, which is why there is nothing to expire and nothing to clean up after a crash. One container is what this deployment runs. The day it runs two, people on different containers will not see each other in the "here now" row -- messages still reach both, because those go through Postgres. Fixing it means shared state, which is a Redis nobody has yet. |
| The composer sits at the end of the column, not pinned to the viewport | Pinning it means the shell owning the scroll region -- `h-dvh` with `overflow-hidden`, and `main` scrolling inside it -- which changes the layout of every screen in the app. The unpinned version was chosen after the pinned one was seen to cover the newest message on desktop and land underneath the bottom nav on a phone. Worth revisiting as a shell change, on its own, with the responsive sweep watching. |
| A channel loads its last 100 entries and no further | No infinite scroll and no "load earlier". A hundred entries is several weeks of a real project channel, and the project's Activity tab holds the full history. Paging back is worth building when somebody actually runs out. |
| No threads, no mentions, no attachments, no reactions | Each is a feature in its own right rather than a corner of this one. Mentions are the first that matters, because they are the reason a message would ever belong in the inbox -- see the note in `src/lib/data/channels.ts`. |
| `next start` logs "The destination stream closed early" whenever a channel is left | Next's own message for a streaming response the client abandoned, which for SSE is every navigation away. The route closes its stream on both `cancel` and `abort`, and the log line still appears -- it comes from Next piping the response, not from the handler. Nothing leaks: the presence entry and the Postgres listener are both torn down. |
| Notifications are in-app only | No email, no push. Both need a mail transport, which this deployment does not have. Inbox was the milestone that would have brought one and did not -- it turned out to be a separate piece of infrastructure, not part of the feature. |

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
