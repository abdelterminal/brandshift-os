import { expect, test } from "@playwright/test";

/**
 * The task drawer.
 *
 * This is the loop the whole app is built around: see what has stopped, open
 * it, act, and land back where you were. Three things are worth protecting --
 * that the drawer is a drawer and not a modal, that the open task is in the
 * URL, and that acting on a task actually changes it.
 */

test("shows the coordination queue rather than a personal list", async ({ page }) => {
  await page.goto("/en/today");

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("Work that has stopped, slipped, or has nobody on it.")).toBeVisible();

  for (const column of ["Blocked", "Overdue", "Unassigned"]) {
    await expect(page.getByRole("heading", { name: column })).toBeVisible();
  }
});

test("opens a task into the URL, and closing it takes the URL back", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();

  const firstTask = page.getByRole("button", { name: "Open task" }).first();
  await firstTask.click();

  // Linkable, so a task can be sent to somebody.
  await expect(page).toHaveURL(/\?task=[0-9a-f-]{36}/);
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  // A drawer, not a dialog *visually*: the list it came from is still rendered
  // and still on screen behind it, so closing lands you back where you were.
  //
  // It is still a modal to assistive technology -- Base UI marks the rest of
  // the page inert while it is open, which is why this asks the DOM rather
  // than the accessibility tree. Trapping focus is right here; you are acting
  // on one task.
  await expect(page.locator('[data-slot="tabs-tab"]', { hasText: "Tasks" })).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/\?task=/);
});

test("opens straight to a task when the URL names one", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "Open task" }).first().click();

  // `router.replace` runs in a transition, so the URL is not updated the
  // instant the click returns. Capturing it too early gave a link with no
  // `?task=` and a test that proved nothing.
  await page.waitForURL(/\?task=/);
  const url = page.url();

  await page.goto("/en/today");
  await page.goto(url);

  await expect(page.getByRole("dialog")).toBeVisible();
});

test("completing a task moves it to Completed and records it", async ({ page }) => {
  await page.goto("/en/work/HAR");
  await page.getByRole("tab", { name: "Tasks" }).click();

  // HAR is the planning project: everything on it is still to do, so the first
  // row is always safe to complete and the assertion does not depend on dates.
  const row = page.getByRole("button", { name: "Open task" }).first();
  const title = (await row.innerText()).split("\n")[0]!.trim();

  await row.click();
  await page.getByRole("button", { name: "Mark complete" }).click();

  // The drawer closes and the list behind it is re-read.
  await expect(page.getByRole("dialog")).toBeHidden();

  const completed = page.locator("section", { hasText: "Completed" });
  await expect(completed.getByText(title, { exact: true })).toBeVisible();

  // Every mutation writes an activity event in the same breath.
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("completed a task").first()).toBeVisible();
});

test("assigning a task from the drawer persists, and can be undone", async ({ page }) => {
  await page.goto("/en/work/HAR");
  await page.getByRole("tab", { name: "Tasks" }).click();

  // HAR is the planning project, and `planTask` deliberately seeds the first
  // title in its list (`TASK_TITLES.HAR`) unassigned and with no due date --
  // a starting point this test doesn't have to guess at. Named directly
  // rather than ".first()": that task has no date, so it sorts into "No
  // deadline", rendered after every dated bucket -- last on the page, not
  // first, and ".first()" would open one of those instead.
  await page.getByText("Read the usability audit and pull the top ten findings").click();

  const drawer = page.getByRole("dialog");
  // Not `getByLabel` -- "Clear assignee" and the picker's own trigger both
  // carry "assignee" in their accessible name too, and `getByLabel` matches
  // by substring. The combobox role is unique to the actual input.
  const assignee = drawer.getByRole("combobox", { name: "Assignee" });
  await expect(assignee).toHaveValue("");

  // Opens the list itself -- focusing the empty input alone doesn't. Not
  // `getByRole("button", { name: "Show people" })`: Base UI wires this
  // button's `aria-labelledby` to the field's own "Assignee" label, which
  // wins over the `aria-label` this app gives it for exactly this purpose --
  // the raw attribute is still there, just not the *computed* accessible
  // name, so an attribute selector reaches it where an accessible-name query
  // cannot. Worth a `KNOWN-GAPS.md` row; not this test's fix to make.
  await drawer.locator('[aria-label="Show people"]').click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  await options.first().click();

  // Controlled by the task itself, not local state: the input only shows
  // the new name once `assignTask` and the `router.refresh()` after it have
  // actually finished, so reading `inputValue()` right after the click would
  // still see the old (empty) one.
  await expect(assignee).not.toHaveValue("");
  const assignedName = await assignee.inputValue();

  // The database, not just this tab's memory. `?task=` survives the reload
  // and reopens the same task directly -- no need to find it in the list
  // again, and the list behind the open drawer is inert to click through
  // anyway (see the drawer's own doc comment on why it traps focus).
  await page.reload();
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toHaveValue(assignedName);

  // Undo, so HAR's first task is unassigned again for the next run -- the
  // same courtesy `board.spec.ts` already pays NOR's own shared fixture.
  await drawer.locator('[aria-label="Clear assignee"]').click();
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toHaveValue("");
});

test("reporting a blocker demands a reason and then shows it", async ({ page }) => {
  await page.goto("/en/work/HAR");
  await page.getByRole("tab", { name: "Tasks" }).click();

  await page.getByRole("button", { name: "Open task" }).first().click();
  await page.getByRole("button", { name: "Report blocker" }).click();

  // "Blocked" with no reason is not information anyone can act on, which is
  // the whole reason the coordination queue exists.
  await page.getByRole("button", { name: "Report blocker" }).click();
  await expect(
    page.getByText("Say what is stopping it, so someone can unblock it."),
  ).toBeVisible();

  await page.getByLabel("Blocker").fill("Waiting on the supplier quote.");
  await page.getByRole("button", { name: "Report blocker" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();

  // It now shows up where a coordinator will find it.
  await page.goto("/en/today");
  const blocked = page.locator("div").filter({ hasText: /^Blocked/ }).first();
  await expect(blocked).toBeVisible();
});
