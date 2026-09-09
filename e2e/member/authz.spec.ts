import { expect, test } from "@playwright/test";

import { MEMBER } from "../people";

/**
 * What a member can and cannot reach.
 *
 * The rule this protects is that a hidden destination and a refused URL agree,
 * because both go through `can()`. If the rail ever stops matching what the
 * pages enforce, one of these fails.
 */

test("gets the member rail, not the coordinator one", async ({ page }) => {
  await page.goto("/en/today");

  const rail = page.getByRole("navigation", { name: "Primary" }).first();
  await expect(rail.getByRole("link", { name: "Today" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "My Work" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Calendar" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Team" })).toBeVisible();

  // Insights needs the module flag, which this member does not have.
  await expect(rail.getByRole("link", { name: "Insights" })).toHaveCount(0);
});

test("gets Now / Next / Later rather than the coordination queue", async ({ page }) => {
  await page.goto("/en/today");

  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Later" })).toBeVisible();
  await expect(page.getByText("Needs a decision")).toHaveCount(0);
});

test("is refused Insights with a 403 that keeps the session", async ({ page }) => {
  await page.goto("/en/insights");

  await expect(page.getByRole("heading", { name: "You do not have access to this" })).toBeVisible();

  // The whole point of 403 over 401: nothing is cleared, and the shell is
  // still there. Losing your work for clicking the wrong link is a punishment,
  // not a security measure.
  await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Back to Today" }).click();
  await page.waitForURL("**/en/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("is refused the coordination queue with a 403 that keeps the session", async ({ page }) => {
  await page.goto("/en/work/queue");

  await expect(page.getByRole("heading", { name: "You do not have access to this" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
});

test("is refused the project wizard", async ({ page }) => {
  await page.goto("/en/work/new");
  await expect(page.getByRole("heading", { name: "You do not have access to this" })).toBeVisible();
});

test("sees no New project button on Work", async ({ page }) => {
  await page.goto("/en/work");
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
});

test("can still read the directory", async ({ page }) => {
  // The org chart is not secret. The `people` flag gates the sensitive parts
  // of a record, not the list of who works here.
  await page.goto("/en/people");
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: MEMBER.name })).toBeVisible();
});
