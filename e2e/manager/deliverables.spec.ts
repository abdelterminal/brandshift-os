import { expect, test, type Page } from "@playwright/test";

/**
 * Deliverables: the artifacts a project produces, with a client lifecycle.
 *
 * What is worth protecting:
 *
 * 1. **The tab groups by state**, and the chevrons walk one deliverable one
 *    step along the line -- Producing → Internal review → With client →
 *    Revising → Published.
 * 2. **Moving into Revising asks for the client's feedback** and refuses
 *    without it.
 * 3. **A deliverable can be created**, and **a task can be converted** into one
 *    -- the task leaves Tasks and a deliverable takes its place.
 * 4. Converting is a manager's action; a member can still move a deliverable's
 *    state.
 */

const main = (page: Page) => page.locator("#main");

async function deliverablesTab(page: Page) {
  await page.goto("/en/work/LUM");
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await expect(main(page).getByText("Launch carrousel — 6 slides")).toBeVisible();
}

async function waitForAction(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200);
}

test("the tab groups deliverables by state and the chevrons walk one along", async ({ page }) => {
  await deliverablesTab(page);

  // Seeded: one per state.
  await expect(main(page).getByRole("heading", { name: "Producing" })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Published" })).toBeVisible();

  const row = main(page)
    .getByRole("listitem")
    .filter({ hasText: "Launch carrousel — 6 slides" });
  const done = waitForAction(page);
  await row.getByRole("button", { name: "Move forward" }).click();
  await done;
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("tab", { name: "Deliverables" }).click();

  // It moved out of Producing into Internal review.
  const internalReview = main(page)
    .getByRole("heading", { name: "Internal review" })
    .locator("xpath=following-sibling::ul[1]");
  await expect(internalReview.getByText("Launch carrousel — 6 slides")).toBeVisible();
});

test("moving into Revising requires the client feedback", async ({ page }) => {
  await deliverablesTab(page);

  // The seeded "Teaser cut" is in Internal review -> forward twice reaches Revising.
  const row = main(page).getByRole("listitem").filter({ hasText: "Teaser cut — 20s vertical" });
  await row.getByRole("button", { name: "Move forward" }).click(); // -> With client
  await page.waitForLoadState("networkidle");

  await main(page)
    .getByRole("listitem")
    .filter({ hasText: "Teaser cut — 20s vertical" })
    .getByRole("button", { name: "Move forward" })
    .click(); // -> Revising, opens the prompt

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Add the client's feedback")).toBeVisible();

  const done = waitForAction(page);
  await dialog.getByLabel("What did the client ask to change?").fill("Tighten the first three seconds.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await done;
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("tab", { name: "Deliverables" }).click();

  await expect(main(page).getByText("Tighten the first three seconds.")).toBeVisible();
});

test("a deliverable can be created and a task converted into one", async ({ page }) => {
  await deliverablesTab(page);

  await main(page).getByRole("button", { name: "New deliverable" }).click();
  const newDialog = page.getByRole("dialog");
  await newDialog.getByLabel("Deliverable").fill("Paid set — 4 formats");
  const created = waitForAction(page);
  await newDialog.getByRole("button", { name: "Create" }).click();
  await created;
  await page.waitForLoadState("networkidle");
  await expect(main(page).getByText("Paid set — 4 formats")).toBeVisible();

  // Convert a task -- the dialog lists the project's open tasks.
  await main(page).getByRole("button", { name: "Convert to deliverable" }).click();
  const convertDialog = page.getByRole("dialog");
  const taskTitle = await convertDialog.getByLabel("Tasks").locator("option:checked").textContent();
  const converted = waitForAction(page);
  await convertDialog.getByRole("button", { name: "Convert to deliverable" }).click();
  await converted;
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("tab", { name: "Deliverables" }).click();

  expect(taskTitle?.trim().length ?? 0).toBeGreaterThan(0);
  await expect(main(page).getByText(taskTitle!.trim())).toBeVisible();
});

test("a member can move a deliverable but cannot convert", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  await page.goto("/en/work/LUM");
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await expect(main(page).getByText("Launch carrousel — 6 slides")).toBeVisible();

  // No convert affordance for a member.
  await expect(main(page).getByRole("button", { name: "Convert to deliverable" })).toHaveCount(0);

  // But the state chevrons are there.
  await expect(
    main(page)
      .getByRole("listitem")
      .filter({ hasText: "Launch carrousel — 6 slides" })
      .getByRole("button", { name: "Move forward" }),
  ).toBeVisible();

  await context.close();
});
