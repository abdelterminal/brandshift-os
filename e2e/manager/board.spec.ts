import { expect, test } from "@playwright/test";

/**
 * The task board's drag-and-drop, restricted to the project's own team.
 *
 * Real pointer drags are not simulated here -- the four chevrons on every
 * card do exactly what a drag does, through the same code, and are what a
 * keyboard or screen-reader user actually has (see task-board.tsx's own
 * reasoning: dnd-kit has no built-in way to drag across separate
 * `SortableContext`s by keyboard, and reimplementing its multi-container
 * reference example was judged more surface than this app's own established
 * answer -- explicit, always-visible move buttons, the same idea SOP steps
 * and template tasks already use). Exercising them is exercising the real
 * mechanism, deterministically, not a lesser stand-in for it.
 *
 * elena.rossi@brandshift.test is seeded as NOR's owner (a `lead`, so she may
 * edit its board) and is not on MER's team at all (so she should see MER's
 * board exactly as it always rendered: read-only).
 *
 * `role="status"` appears twice on this page once the board is interactive:
 * dnd-kit's own screen-reader live region (nameless, for its drag
 * announcements) and the Save bar (named, via `aria-label`, precisely so a
 * test -- or a screen reader -- can tell the two apart).
 */

function saveBar(page: import("@playwright/test").Page) {
  return page.getByRole("status", { name: /unsaved/i });
}

test("a project's own lead can move a card, and it survives a reload", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();

  // Order history migration is Elena's own -- she owns NOR and is its
  // assignee -- so blocking it as her notifies nobody (the recipient list is
  // the project owner plus the assignee, both her, and an actor is never
  // notified of their own action). A task assigned to someone else would
  // leave that person a real, permanent notification behind even after the
  // task itself is moved back, which is exactly what broke inbox.spec.ts the
  // first time this test was written against a task of Lukas's.
  const card = page.locator("li").filter({ hasText: "Order history migration" });
  await expect(card).toBeVisible();

  // Nothing to save yet -- opening the board is not a change.
  await expect(saveBar(page)).toHaveCount(0);

  await card.getByRole("button", { name: "Move to the next column" }).click();

  // Entering Blocked needs a reason, the same one reportBlocker() asks for.
  const dialog = page.getByRole("dialog", { name: "Report blocker" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("· Required")).toBeVisible();

  await dialog.getByRole("button", { name: "Report blocker" }).click();
  await expect(dialog.getByText("Say what is stopping it, so someone can unblock it.")).toBeVisible();

  await dialog.getByLabel("Blocker").fill("Waiting on the vendor to confirm a slot.");
  await dialog.getByRole("button", { name: "Report blocker" }).click();
  await expect(dialog).toBeHidden();

  // Staged, not yet saved -- the card already reads Blocked, since that is
  // what Save is about to write, not last-known-from-the-server.
  await expect(card.getByText("Blocked", { exact: true })).toBeVisible();
  await expect(saveBar(page)).toContainText("unsaved change");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(saveBar(page)).toHaveCount(0);

  // The database, not just this tab's memory: a fresh load has to agree.
  // Back on the List view (a fresh mount defaults to it) -- every row there
  // shares the accessible name "Open task", so the title itself is what
  // finds this one row, and clicking it opens the same drawer as everywhere
  // else in the app.
  await page.reload();
  await page.getByRole("tab", { name: "Tasks" }).click();
  await expect(page.getByText("Order history migration")).toBeVisible();
  await page.getByText("Order history migration").click();
  await expect(page.getByRole("dialog").getByText("Blocked", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Waiting on the vendor to confirm a slot."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // NOR is a shared fixture other specs read from too -- inbox.spec.ts opens
  // whichever task sorts first and expects to find it not yet blocked. Undo
  // the save the same way it was made, so this test leaves NOR exactly as it
  // found it rather than a real, permanent write other tests then trip over.
  await page.getByRole("radio", { name: "Board" }).click();
  await card.getByRole("button", { name: "Move to the previous column" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(saveBar(page)).toHaveCount(0);
});

test("moving a card into Blocked without a reason is refused", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();

  const card = page.locator("li").filter({ hasText: "Order history migration" });
  await card.getByRole("button", { name: "Move to the next column" }).click();

  const dialog = page.getByRole("dialog", { name: "Report blocker" });
  await dialog.getByRole("button", { name: "Report blocker" }).click();
  await expect(dialog.getByText("Say what is stopping it, so someone can unblock it.")).toBeVisible();
  await expect(dialog).toBeVisible();

  // Cancelling leaves the card exactly where it started -- nothing was ever
  // moved, since the reason gate runs before any local state changes.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(saveBar(page)).toHaveCount(0);
  await expect(card.getByText("In progress", { exact: true })).toBeVisible();
});

test("leaving Blocked needs no reason, only entering it does", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();

  // Blocked already holds one seeded task. One column left of Blocked is
  // In progress -- the columns run To do / In progress / Blocked / Complete
  // -- and the reason dialog only ever gates a move *into* Blocked.
  const card = page.locator("li").filter({ hasText: "Load test at 4x expected peak" });
  await card.getByRole("button", { name: "Move to the previous column" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card.getByText("In progress", { exact: true })).toBeVisible();
  await expect(saveBar(page)).toContainText("unsaved change");

  // Discard rather than save -- this test is not the one proving persistence.
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(saveBar(page)).toHaveCount(0);
});

test("someone off the project's team sees the board, not the controls", async ({ page }) => {
  // Elena is not on Meridian rebrand's team -- Claire's, Nadia's, Yusuf's and
  // Sofia's, per the seed -- so she can still see the project (work.view is
  // open to everyone) but not rearrange its board.
  await page.goto("/en/work/MER");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();

  await expect(page.getByRole("heading", { name: "In progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move to the next column" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open task" })).toHaveCount(0);
  await expect(saveBar(page)).toHaveCount(0);
});
