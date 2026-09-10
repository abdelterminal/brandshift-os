import { expect, test, type Page } from "@playwright/test";

/**
 * Who may change a piece of work's state.
 *
 * Reading a task or a deliverable is open to the whole organization. Moving one
 * -- starting it, completing it, reporting or clearing a blocker, reassigning
 * it, walking a deliverable along its line -- is not: it is the task's
 * assignee, a lead or contributor on its project, or a manager. The drawer and
 * the deliverables panel hide the controls for everyone else, and the Server
 * Actions refuse them, so a hidden button and a refused action never disagree
 * (`mayWorkOn`, and `CLAUDE.md`'s rule on that).
 *
 * The assignee-who-is-a-plain-member case is covered next door, in
 * `deliverables.spec.ts` ("a member on the work can move a deliverable"), which
 * signs in as Marc. This file covers the two edges around it: a member on
 * neither, and a manager on nothing.
 *
 * LUM (the Lumen campaign) is the fixture: owned by Priya, with Marc and Nadia
 * on the team. Lukas -- `member.json` -- is on none of it and holds none of its
 * work, so the gate denies him. He *is* a contributor on NOR, which is how the
 * "a contributor keeps the actions" case has something to assert.
 */

const main = (page: Page) => page.locator("#main");
const RESTRICTED = "Only the assignee or someone on this project's team can change this.";

async function openFirstTask(page: Page, key: string) {
  await page.goto(`/en/work/${key}`);
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "Open task" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("a member on neither the task nor its project gets a read-only drawer", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  await openFirstTask(page, "LUM");
  const drawer = page.getByRole("dialog");

  // The note takes the place of the action row.
  await expect(drawer.getByText(RESTRICTED)).toBeVisible();

  // None of the four ways to move it are rendered.
  await expect(drawer.getByRole("button", { name: "Start" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Report blocker" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Clear blocker" })).toHaveCount(0);

  // The assignee is shown as plain text, not the reassignment picker.
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toHaveCount(0);

  // Reading is untouched: the project line and the assignee are still shown.
  await expect(drawer.getByText("Lumen campaign launch")).toBeVisible();
  await expect(drawer.getByText("Assignee", { exact: true })).toBeVisible();

  await context.close();
});

test("a contributor on the project keeps the task actions", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  // Lukas is a contributor on NOR -- that membership, not assignment, is what
  // opens the drawer up. The reassignment picker (in place of a plain-text
  // assignee) and the absence of the note are the status-independent tells
  // that the actions are his; which mover shows depends on the task's state.
  await openFirstTask(page, "NOR");
  const drawer = page.getByRole("dialog");

  await expect(drawer.getByText(RESTRICTED)).toHaveCount(0);
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toBeVisible();

  await context.close();
});

test("a manager can act on a project they are not on", async ({ page }) => {
  // The spec's own storage state is the manager's. Elena is not on LUM, so
  // this is the manager branch of the gate and nothing else.
  await openFirstTask(page, "LUM");
  const drawer = page.getByRole("dialog");

  await expect(drawer.getByText(RESTRICTED)).toHaveCount(0);
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toBeVisible();
});

test("a member on neither cannot move a deliverable", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  await page.goto("/en/work/LUM");
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await expect(main(page).getByText("Launch carrousel — 6 slides")).toBeVisible();

  // The panel says so once, rather than on every row.
  await expect(main(page).getByText(RESTRICTED)).toBeVisible();

  // No create affordance, and no chevrons on the row.
  await expect(main(page).getByRole("button", { name: "New deliverable" })).toHaveCount(0);
  await expect(
    main(page)
      .getByRole("listitem")
      .filter({ hasText: "Launch carrousel — 6 slides" })
      .getByRole("button", { name: "Move forward" }),
  ).toHaveCount(0);

  await context.close();
});

test("a manager can move a deliverable on a project they are not on", async ({ page }) => {
  await page.goto("/en/work/LUM");
  await page.getByRole("tab", { name: "Deliverables" }).click();

  // "Key visual — hero banner" is seeded in Revising and nothing else in the
  // suite touches it, so the chevron is here whatever order the files run in.
  await expect(
    main(page)
      .getByRole("listitem")
      .filter({ hasText: "Key visual — hero banner" })
      .getByRole("button", { name: "Move back" }),
  ).toBeVisible();
});
