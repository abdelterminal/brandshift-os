import { expect, test, type Page } from "@playwright/test";

/**
 * Objectives.
 *
 * What is worth protecting, in the order it would cost most:
 *
 * 1. **Progress is measured from the start.** A bar that reads 60% when the
 *    truth is a third of the way is the failure mode of every OKR tool, and it
 *    is the kind of wrong that gets believed rather than argued with.
 * 2. **"Not measured" is not zero.** They are different facts and only one of
 *    them is somebody's fault. The screen has to say so.
 * 3. Every figure traces to a person and a date.
 * 4. Nobody without permission can set direction.
 */

const main = (page: Page) => page.locator("#main");

test("opens with what needs attention, not with a wall of green", async ({ page }) => {
  await page.goto("/en/objectives");

  await expect(main(page).getByRole("heading", { name: "Objectives", level: 1 })).toBeVisible();

  // Exceptions first, as everywhere else in this app.
  await expect(main(page).getByRole("heading", { level: 2 }).first()).toHaveText("Needs attention");

  // The seeded objective nobody has measured belongs in that section.
  await expect(main(page).getByText("Grow the film side into a standalone offer")).toBeVisible();
});

test("says nothing has been measured rather than showing zero", async ({ page }) => {
  await page.goto("/en/objectives");
  await main(page)
    .getByRole("link", { name: /Grow the film side/ })
    .click();
  await expect(page).toHaveURL(/\/en\/objectives\/[0-9a-f-]{36}$/);

  // Not "0%": the distinction the whole model is built around.
  await expect(main(page).getByText("Nobody has recorded a figure for this yet.")).toBeVisible();
  await expect(main(page).getByText("No figures recorded yet.")).toBeVisible();

  // And the bar says so to a screen reader too, by carrying no value at all.
  const bar = main(page).getByRole("progressbar").first();
  await expect(bar).not.toHaveAttribute("aria-valuenow", /.*/);
});

test("measures progress from the start, not from zero", async ({ page }) => {
  await page.goto("/en/objectives");

  // Seeded: retainer revenue started at 12,000 and is at 21,000 against a
  // target of 30,000. That is half the way, not seventy percent.
  await main(page)
    .getByRole("link", { name: /Win back the retainer clients/ })
    .click();
  // The title appears twice -- once on the card, once as the history heading.
  await expect(main(page).getByText("Retainer revenue per month").first()).toBeVisible();

  const bar = main(page)
    .getByRole("progressbar", { name: /Retainer revenue per month/ })
    .first();
  await expect(bar).toHaveAttribute("aria-valuenow", "50");
});

test("a figure carries who recorded it and when", async ({ page }) => {
  const title = `Objective ${Date.now()}`;

  await page.goto("/en/objectives");
  await page.getByRole("button", { name: "New objective" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Objective", { exact: true }).fill(title);
  await dialog.getByLabel("What is measured 1").fill("Things counted");
  await dialog.getByLabel("Starting at 1").fill("0");
  await dialog.getByLabel("Target 1").fill("10");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/objectives\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Record a figure" }).first().click();
  const record = page.getByRole("dialog");
  await record.getByLabel("Value").fill("4");
  await record.getByLabel("Note").fill("Counted on the whiteboard");
  await record.getByRole("button", { name: "Save" }).click();

  await expect(main(page).getByText("Counted on the whiteboard")).toBeVisible();
  // The author's name, because a number nobody can attribute is a rumour.
  await expect(
    main(page)
      .getByText(/Elena Rossi/)
      .first(),
  ).toBeVisible();

  // 4 of 10 from a start of 0.
  await expect(main(page).getByText("40% of the way")).toBeVisible();
});

test("refuses a target that is not a number, rather than storing zero", async ({ page }) => {
  await page.goto("/en/objectives");
  await page.getByRole("button", { name: "New objective" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Objective", { exact: true }).fill(`Bad number ${Date.now()}`);
  await dialog.getByLabel("What is measured 1").fill("Something");
  await dialog.getByLabel("Starting at 1").fill("0");
  await dialog.getByLabel("Target 1").fill("about ten");
  await dialog.getByRole("button", { name: "Create" }).click();

  // A goal of zero that reports itself as met is the worst outcome available
  // to this screen, so the refusal has to be explicit.
  await expect(dialog.getByRole("alert")).toContainText(/not a number/i);
  await expect(page).toHaveURL(/\/en\/objectives$/);
});

test("closing one asks how it went, and can be undone", async ({ page }) => {
  const title = `Closing ${Date.now()}`;

  await page.goto("/en/objectives");
  await page.getByRole("button", { name: "New objective" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Objective", { exact: true }).fill(title);
  await dialog.getByLabel("What is measured 1").fill("Something");
  await dialog.getByLabel("Starting at 1").fill("0");
  await dialog.getByLabel("Target 1").fill("3");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/en\/objectives\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Close objective" }).click();
  const closing = page.getByRole("dialog");
  await closing.getByLabel("What happened").fill("It went fine.");
  await closing.getByRole("button", { name: "Close objective" }).click();

  await expect(main(page).getByText("It went fine.")).toBeVisible();

  // Closing is a judgement, not a deletion: it can be taken back.
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("button", { name: "Close objective" })).toBeVisible();
});

test("a member can read the direction but not set it", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await context.newPage();

  await memberPage.goto("/en/objectives");

  // Open to everyone: a goal half the company cannot see is a goal nobody
  // pulls towards.
  await expect(
    memberPage.locator("#main").getByRole("heading", { name: "Objectives", level: 1 }),
  ).toBeVisible();

  // But setting direction is a manager's job.
  await expect(memberPage.getByRole("button", { name: "New objective" })).toHaveCount(0);

  await context.close();
});
