import { expect, test } from "@playwright/test";

/**
 * The coordination queue's uncapped page, and the row-level fixes that ship
 * with it.
 *
 * Due dates and which priority a seeded task lands on are randomised per run
 * (`planTask`/`planPriority` in `src/db/seed.ts`) -- only their *shape* is
 * fixed, so these assert on format ("N days late", a priority word) rather
 * than on which task shows it or what the exact number is.
 */

test("an overdue task reads as late without waiting for someone to mark it blocked", async ({
  page,
}) => {
  await page.goto("/en/today");

  const overdue = page.locator("div").filter({ hasText: /^Overdue/ }).first();
  // The overdue band is seeded `in_progress`, never `blocked` -- so this text
  // existing at all is the fix: before it, only a `blocked` task's date ever
  // read in anything but a plain "d MMM".
  await expect(overdue.getByText(/\d+ days? late/).first()).toBeVisible();
});

test("priority shows on a row for urgent and high work", async ({ page }) => {
  // MER is seeded `priority: "urgent"`, so its later tasks are always either
  // `urgent` or `high` (`planPriority`) -- one of those two pills is always
  // on the list, even though which task and which of the two varies by run.
  await page.goto("/en/work/MER");
  await page.getByRole("tab", { name: "Tasks" }).click();

  await expect(page.getByText(/^(Urgent|High)$/).first()).toBeVisible();
});

test("the uncapped queue has all three columns and the same counts Today does", async ({
  page,
}) => {
  await page.goto("/en/today");
  const counts = await Promise.all(
    ["Blocked", "Overdue", "Unassigned"].map(async (name) => {
      const heading = page.getByRole("heading", { name: new RegExp(`^${name}`) });
      return (await heading.textContent())?.trim();
    }),
  );

  await page.goto("/en/work/queue");
  await expect(page.getByRole("heading", { name: "Needs a decision" })).toBeVisible();
  await expect(
    page.getByText("Work that has stopped, slipped, or has nobody on it."),
  ).toBeVisible();

  for (const [i, name] of ["Blocked", "Overdue", "Unassigned"].entries()) {
    await expect(page.getByRole("heading", { name: new RegExp(`^${name}`) })).toHaveText(
      counts[i]!,
    );
  }

  // Uncapped: Today truncates a column past eight rows behind "View all";
  // this page is what that link opens, so it never should. It's a `Link`
  // under a `Button`'s styling, so its role stays "link" -- `Button`'s own
  // `nativeButton` doc explains why it isn't "button".
  await expect(page.getByRole("link", { name: "View all" })).toHaveCount(0);
});

test("?bucket= narrows the page to the one column Today's card was showing", async ({ page }) => {
  await page.goto("/en/work/queue?bucket=unassigned");

  await expect(page.getByRole("heading", { name: "Unassigned" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blocked" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Overdue" })).toHaveCount(0);
});

test("the way back is a link to Today", async ({ page }) => {
  await page.goto("/en/work/queue");

  await page.getByRole("link", { name: "Back to list" }).click();
  await page.waitForURL("**/en/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});
