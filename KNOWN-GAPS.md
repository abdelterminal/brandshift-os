# Known gaps

Things that are deliberately not done, not finished, or not verified — and what it would take to
close each one.

This file exists because the same three caveats were repeated at the end of five milestones in a
row and were in danger of becoming background noise. A gap that gets mentioned every time and
written down nowhere is a gap nobody ever fixes.

**Update this file in the same commit as the work.** Add a row when something is deferred, and
delete the row when it is closed — do not leave a struck-through list of things that are actually
finished. `CLAUDE.md` points here for the same reason.

Last reviewed: end of M5 (Phase 1 complete).

---

## Open

### 1. Responsive is unverified below ~654px

**Status:** open since M2.

The definition of done says 320 / 375 / 768 / 1024 / 1440px. Everything from ~654px up has been
checked in a real browser. Below that it has not, because Chrome clamps its own minimum window
width and the tooling in use drives a real Chrome window rather than an emulated viewport.

What *has* been done at narrow widths: the mobile bottom nav and the drawer-based "More" sheet
were exercised at 654px, the 17-step colour ramps were made to scroll rather than crush their
labels, and every wide surface (tables, the Kanban board, ramps) sits in its own
`overflow-x-auto` container so the page body never scrolls sideways.

**To close it:** Playwright with a 320px and a 375px viewport, asserting
`document.documentElement.scrollWidth <= clientWidth` on every route, plus a look at the
screenshots. This is the cheapest thing on this list and it depends on gap 2.

### 2. No end-to-end tests, and no Playwright

**Status:** open since M0. The scaffold's README claimed it; nothing ever installed it.

`README.md` and `ROADMAP.md` both told you to run `npx playwright test`. Playwright is not in
`package.json`, there is no `e2e/` directory, and there is no `test:e2e` script. Those two
documents have been corrected; this row is the actual work.

Everything currently verified end to end — sign-in, the 403 path, the task drawer, the project
wizard — was verified by hand, once, by driving a browser. That is not a regression net.

**To close it:** `npm i -D @playwright/test`, an `e2e/` directory, a `test:e2e` script, and specs
for the paths that would hurt most if they broke: sign in, sign out, 401 vs 403, complete a task,
publish a project through the wizard, and switch locale.

### 3. Accessibility is enforced for colour only

**Status:** open since M2.

`src/app/tokens.test.ts` holds every semantic colour pair to WCAG AA — 4.5:1 for text, 3:1 for
control edges and focus rings — in both themes, and fails the build otherwise. That is real, and
it is only contrast.

Nothing checks landmark structure, heading order, form labelling, focus order or ARIA
correctness. Those were built carefully by hand (real `<label for>`, a named
password-visibility button carrying `aria-pressed`, `aria-live` on every form error, a skip
link, `aria-current` on the active nav item) but "built carefully" is not "checked".

`axe-core` is present in `node_modules` only as a transitive dependency. It is not wired to
anything.

**To close it:** `@axe-core/playwright`, and an axe assertion on every route in the e2e run.
Depends on gap 2.

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

---

## Closed

Kept briefly so the same ground is not re-argued.

- **`DEV_USER_EMAIL`** — the M3 stopgap that picked which seeded person the shell rendered as.
  Removed in M4 when real sign-in landed.
