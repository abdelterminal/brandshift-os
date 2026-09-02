# Known gaps

Things that are deliberately not done, not finished, or not verified — and what it would take to
close each one.

This file exists because the same three caveats were repeated at the end of five milestones in a
row and were in danger of becoming background noise. A gap that gets mentioned every time and
written down nowhere is a gap nobody ever fixes.

**Update this file in the same commit as the work.** Add a row when something is deferred, and
delete the row when it is closed — do not leave a struck-through list of things that are actually
finished. `CLAUDE.md` points here for the same reason.

Last reviewed: after the end-to-end suite landed.

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
| Invites send no email | There is no mail transport yet; that arrives with Inbox in Phase 2. The invite dialog says so on screen rather than implying a message was sent. |
| The command palette loads its whole index | A few dozen projects, people and departments. Filtering in the browser is faster and steadier than a request per keystroke. It becomes a server search behind the same `PaletteEntry` shape when an org outgrows it. |
| The People list sorts and pages in memory | `selectJoined()` ends at `where` so the tenant filter is always last. At directory scale the difference is not measurable; if it becomes so, the sort and limit move into the helper rather than into each caller. |
| No rate limiting on sign-in | Single-tenant on a local network. Sign-in already resists account enumeration (one message for both halves, and a dummy hash verified when no user matches), but nothing throttles guesses. Worth adding before this is ever exposed beyond the LAN. |
| `cancelled` tasks appear in no bucket | Neither open nor complete. Work someone decided not to do belongs in neither queue; it is still reachable from the project board. |
| The e2e suite runs serially, on one database | It completes tasks and publishes projects, so parallel workers would race each other through shared rows. One worker takes about a minute, which is not worth engineering around yet. |
| axe covers WCAG 2.1 A and AA, not its best-practice rules | Those are opinions worth reading and not worth failing a build over. A suite that cries wolf gets muted, and then it catches nothing. |

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
