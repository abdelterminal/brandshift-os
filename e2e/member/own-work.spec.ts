import { expect, test, type Page } from "@playwright/test";

import { MEMBER } from "../people";

/**
 * A member sees only their own work.
 *
 * Named to sort before `session.spec.ts`, which signs out and so invalidates
 * the storage state the rest of the `member` project shares.
 *
 * Every project's task list, the activity feed and other people's pages are
 * for someone who coordinates the work. A plain member -- Lukas, the `member`
 * fixture -- gets their own tasks and the projects they are on. Nothing about
 * what a colleague is doing, or how far along they are.
 *
 * The directory is the one place this does not apply: it is the roster of who
 * works here, open to everyone, the same as before the silo. What a member
 * does not get there is a way into anyone else's own page, or the department
 * structure -- that is a coordinator's view of how the org is organized, not
 * part of a roster.
 *
 * Lukas is on ATL and NOR. Priya is a teammate there; Sofia is on neither.
 */

const main = (page: Page) => page.locator("#main");

test("the directory is everyone, by name, with no department structure", async ({ page }) => {
  await page.goto("/en/people");
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();

  // Both a teammate and somebody on none of Lukas's projects are listed --
  // the roster is not narrowed the way a project's own task list is. (The
  // page renders a mobile and a desktop row, so `.first()`: the assertion is
  // that the name is present, not which copy.)
  await expect(main(page).getByText("Priya Raman").first()).toBeAttached();
  await expect(main(page).getByText("Sofia Laurent").first()).toBeAttached();

  // Neither is a link -- their own page is where their work lives.
  await expect(main(page).getByRole("link", { name: "Priya Raman" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Sofia Laurent" })).toHaveCount(0);

  // Their own row still links, to their own page.
  await expect(main(page).getByRole("link", { name: MEMBER.name })).toBeVisible();

  // No department column, and no department text on a row that has one.
  await expect(main(page).getByRole("columnheader", { name: "Department" })).toHaveCount(0);
  await expect(main(page).getByText("Client Services", { exact: true })).toHaveCount(0);
});

test("another person's page is a 404", async ({ page }) => {
  // A well-formed id that is not the member's own: the silo refuses it before
  // it ever becomes a question of whether that person exists.
  const response = await page.goto("/en/people/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible();
});

test("a project they are not on is a 404", async ({ page }) => {
  // HAR belongs to Elena, Inès and Yusuf. Lukas is not on it.
  const response = await page.goto("/en/work/HAR");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible();
});

test("a project they are on shows their own work, and no activity feed", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await expect(main(page).getByRole("heading", { name: /Northwind/, level: 1 })).toBeVisible();

  // The activity feed is a running log of everyone's actions -- gone for a member.
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveCount(0);

  // The team is still there, by name.
  await page.getByRole("tab", { name: "Team" }).click();
  await expect(main(page).getByText("Priya Raman").first()).toBeVisible();

  // The Tasks tab is the member's own work: opening a row lets him work it
  // (he is a contributor on NOR), but reassigning is a manager's call, so the
  // drawer shows a read-only assignee, not the picker.
  await page.getByRole("tab", { name: "Tasks" }).click();
  const openTaskButtons = page.getByRole("button", { name: "Open task" });
  expect(await openTaskButtons.count()).toBeGreaterThan(0);
  await openTaskButtons.first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("combobox", { name: "Assignee" })).toHaveCount(0);
  await expect(drawer.getByText("Only a manager can reassign this.")).toBeVisible();
});
