import { expect, test, type Page } from "@playwright/test";

/**
 * Procedures.
 *
 * What is worth protecting, in the order it would cost most:
 *
 * 1. **The screen leads with what has gone stale.** That is the only thing on
 *    it costing anybody anything -- a procedure nobody has checked in a year
 *    tells people to do the wrong thing with the authority of being written
 *    down.
 * 2. **"Never reviewed" is not the same as "overdue".** Different problems,
 *    different fixes, and the list ranks them differently.
 * 3. Marking one reviewed is a single click, and it says who and when.
 * 4. The owner can review their own procedure without being a manager.
 */

const main = (page: Page) => page.locator("#main");

test("opens with what has gone stale", async ({ page }) => {
  await page.goto("/en/sops");

  await expect(main(page).getByRole("heading", { name: "Procedures", level: 1 })).toBeVisible();
  await expect(main(page).getByRole("heading", { level: 2 }).first()).toHaveText("Needs a review");

  // Seeded nearly a year past its review date, so it is the worst in the
  // library and belongs at the top.
  const stale = main(page).getByRole("link").first();
  await expect(stale).toContainText("Handing over a website");
  await expect(stale).toContainText("Review overdue");
});

test("tells never-reviewed apart from overdue", async ({ page }) => {
  await page.goto("/en/sops");

  // Both need attention and they are not the same problem: one has been
  // checked and gone out of date, the other has never been checked at all.
  await expect(main(page).getByText("Review overdue")).toBeVisible();
  await expect(main(page).getByText("Never reviewed")).toBeVisible();

  // Overdue outranks never-reviewed, so it comes first.
  const rows = main(page).getByRole("link");
  await expect(rows.nth(0)).toContainText("Handing over a website");
  await expect(rows.nth(1)).toContainText("Answering an RFP");
});

test("the breadcrumb says Procedures, not the path segment", async ({ page }) => {
  await page.goto("/en/sops");

  // It read a lowercase "sops" for one commit, which is the same fault that
  // once put raw UUIDs in here.
  const trail = page.getByRole("navigation", { name: /breadcrumb/i }).first();
  await expect(trail).toContainText("Procedures");
  await expect(trail).not.toContainText("sops");
});

test("one click marks it reviewed, and says who and when", async ({ page }) => {
  await page.goto("/en/sops/handing-over-a-website");

  await expect(main(page).getByText("Review overdue")).toBeVisible();

  // No dialog, no confirmation: a six-month check that costs a form is a check
  // nobody does, and then the whole library is permanently overdue.
  await page.getByRole("button", { name: "I have checked this" }).click();

  await expect(main(page).getByText(/Reviewed .* by Elena Rossi/)).toBeVisible();
  await expect(main(page).getByText("Review overdue")).toHaveCount(0);
});

test("steps are an ordered list, in the order they were written", async ({ page }) => {
  await page.goto("/en/sops/handing-over-a-website");

  const steps = main(page).getByRole("listitem");
  await expect(steps.first()).toContainText("Transfer the domain");

  // The one that matters is last, and it stays last.
  await expect(main(page).getByText(/Agree in writing who is called out of hours/)).toBeVisible();
});

test("a procedure can be written, and needs at least one step", async ({ page }) => {
  const title = `Procedure ${Date.now()}`;

  await page.goto("/en/sops");
  await page.getByRole("button", { name: "New procedure" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Procedure", { exact: true }).fill(title);
  await dialog.getByLabel("What happens 1").fill("Do the first thing");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/sops\/procedure-\d+$/);
  await expect(main(page).getByText("Do the first thing")).toBeVisible();

  // Written and never checked: it lands in the section that says so.
  await expect(main(page).getByText("Nobody has confirmed this is still right.")).toBeVisible();
});

test("a member can read a procedure but not write one", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await context.newPage();

  await memberPage.goto("/en/sops");

  // How the work is done is for everyone who does it.
  await expect(
    memberPage.locator("#main").getByRole("heading", { name: "Procedures", level: 1 }),
  ).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "New procedure" })).toHaveCount(0);

  // And not somebody else's procedure to sign off either.
  await memberPage.goto("/en/sops/handing-over-a-website");
  await expect(memberPage.getByRole("button", { name: "I have checked this" })).toHaveCount(0);

  await context.close();
});
