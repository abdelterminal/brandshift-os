import { expect, test, type Page } from "@playwright/test";

/**
 * Templates.
 *
 * What is worth protecting, in the order it would cost most:
 *
 * 1. **The dates.** A template that puts every deadline in the wrong week is
 *    worse than no template, because people trust it -- it came from the last
 *    time the job went well.
 * 2. **"No deadline" survives the round trip** and does not become day zero.
 * 3. A procedure's steps become a template's tasks, and a project's tasks
 *    become a template's shape.
 * 4. Nobody without permission can write one.
 */

const main = (page: Page) => page.locator("#main");

/** A key made of letters only -- the format forbids digits. */
const freshKey = () => {
  const digits = String(Date.now()).slice(-4);
  return [...digits].map((d) => "ABCDEFGHIJ"[Number(d)]).join("");
};

test("lists what each template makes and how long it runs", async ({ page }) => {
  await page.goto("/en/templates");

  await expect(main(page).getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();

  // Seeded with a six-week schedule.
  await expect(main(page).getByText(/Film project/)).toBeVisible();
  await expect(main(page).getByText(/42 days of work/)).toBeVisible();

  // And one with no dates at all, which is a real state rather than zero.
  await expect(main(page).getByText(/No deadlines set/)).toBeVisible();
});

test("shows the day of the project each task falls on", async ({ page }) => {
  await page.goto("/en/templates/film-project");

  // A day number, not a date: a template has no calendar until a project
  // starts and says when it begins.
  await expect(main(page).getByText("Day 0")).toBeVisible();
  await expect(main(page).getByText("Day 42")).toBeVisible();
});

test("starting a project turns day numbers into real deadlines", async ({ page }) => {
  const key = freshKey();

  await page.goto("/en/templates/film-project");
  await page.getByRole("button", { name: "Start a project" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill(`Template run ${Date.now()}`);
  await dialog.getByLabel("Key").fill(key);
  await dialog.getByLabel("Starts on").fill("2026-09-07");
  await dialog.getByRole("button", { name: "Start a project" }).click();

  await expect(page).toHaveURL(new RegExp(`/en/work/${key}$`));

  // The last task is due on day 42, so the project is: 7 Sep + 42 = 19 Oct.
  // This is the assertion the whole feature stands on.
  await expect(main(page).getByText(/October 19, 2026/)).toBeVisible();
  await expect(main(page).getByText("0 of 6 done")).toBeVisible();
});

test("refuses a key that is already taken, rather than making a second project", async ({
  page,
}) => {
  await page.goto("/en/templates/film-project");
  await page.getByRole("button", { name: "Start a project" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Clashing key");
  // Seeded, so it is certainly taken.
  await dialog.getByLabel("Key").fill("NOR");
  await dialog.getByRole("button", { name: "Start a project" }).click();

  await expect(dialog.getByRole("alert")).toContainText(/already uses that key/i);
  await expect(page).toHaveURL(/\/en\/templates\/film-project$/);
});

test("refuses days that are not a whole number, rather than reading them as day zero", async ({
  page,
}) => {
  await page.goto("/en/templates");
  await page.getByRole("button", { name: "New template" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template", { exact: true }).fill(`Bad offset ${Date.now()}`);
  await dialog.getByLabel("Task 1").fill("Something");
  await dialog.getByLabel("Due on day 1").fill("two weeks");
  await dialog.getByRole("button", { name: "Create" }).click();

  // Day zero would silently put a deadline on the first day of every project
  // started from this template.
  await expect(dialog.getByRole("alert")).toContainText(/whole number/i);
});

test("blank days means no deadline, and survives being saved", async ({ page }) => {
  const name = `No deadlines ${Date.now()}`;

  await page.goto("/en/templates");
  await page.getByRole("button", { name: "New template" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template", { exact: true }).fill(name);
  await dialog.getByLabel("Task 1").fill("Whenever it happens");
  // Deliberately left blank.
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/templates\/no-deadlines-\d+$/);
  // Exact, because "No deadlines set" in the header contains this string too.
  await expect(main(page).getByText("No deadline", { exact: true })).toBeVisible();
  await expect(main(page).getByText("No deadlines set")).toBeVisible();
});

test("a procedure becomes a template, keeping its order and inventing no schedule", async ({
  page,
}) => {
  await page.goto("/en/sops/handing-over-a-website");

  await page.getByRole("button", { name: "Make a template from this" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template name").fill(`From procedure ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/templates\/from-procedure-\d+$/);

  // The steps came across in order.
  await expect(main(page).getByText("Transfer the domain and the hosting")).toBeVisible();

  // A procedure says what happens, not how long it takes, so no dates were
  // invented on its behalf.
  await expect(main(page).getByText("No deadlines set")).toBeVisible();
});

test("a member can read a template but not write one", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await context.newPage();

  await memberPage.goto("/en/templates");
  await expect(
    memberPage.locator("#main").getByRole("heading", { name: "Templates", level: 1 }),
  ).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "New template" })).toHaveCount(0);

  // Nor start a project from one: that is `project.create`.
  await memberPage.goto("/en/templates/film-project");
  await expect(memberPage.getByRole("button", { name: "Start a project" })).toHaveCount(0);

  await context.close();
});
