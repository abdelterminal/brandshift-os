import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../axe";
import { FINANCE_ROUTES, VIEWPORTS } from "../routes";

/**
 * Quotes, invoices and expenses.
 *
 * Signed in as operations, the only seeded role holding the `finance` module.
 *
 * What is worth protecting, in the order it would cost most:
 *
 * 1. **The arithmetic.** A total that is a penny out costs more trust than it
 *    costs time, and the number on the form has to be the number that is
 *    stored. `src/lib/money.test.ts` proves the functions; this proves the
 *    screen uses them.
 * 2. **Numbers are never reused**, and a sent invoice is voided rather than
 *    deleted -- a gap in a sequence reads as a missing document.
 * 3. Part payments are real, and the status follows the arithmetic.
 * 4. An accepted quote becomes a project, with its lines as tasks.
 */

const main = (page: Page) => page.locator("#main");

test("opens on what is overdue", async ({ page }) => {
  await page.goto("/en/finance");

  await expect(main(page).getByRole("heading", { name: "Finance", level: 1 })).toBeVisible();

  // Exceptions first, as everywhere else in this app.
  const headings = main(page).getByRole("heading", { level: 2 });
  await expect(headings.first()).toHaveText("Overdue");

  // The seeded Northwind invoice is fifty days old and unpaid.
  await expect(main(page).getByText(/Replatform, milestone two/)).toBeVisible();
});

test("the total on the form is the total that is stored", async ({ page }) => {
  await page.goto("/en/finance/quotes");
  // A routed composer now, not a dialog -- and rendered as a link (it goes
  // to /finance/quotes/new), which is also why it is found by its link role
  // rather than a button role.
  await page.getByRole("link", { name: "New quote" }).click();
  await expect(page).toHaveURL(/\/en\/finance\/quotes\/new$/);

  const title = `Arithmetic check ${Date.now()}`;
  await page.getByRole("textbox", { name: "What it is for" }).fill(title);
  await page.getByLabel("Company", { exact: true }).selectOption({ label: "Kestrel Partners" });

  // 1.5 days at 800, plus 20% -- typed the way people type it.
  await page.getByLabel("Description 1").fill("Strategy day");
  await page.getByLabel("Quantity 1").fill("1.5");
  await page.getByLabel("Unit price 1").fill("800");

  // 1,200.00 net and 240.00 tax: 1,440.00. Shown in the live preview, which
  // renders the same DocumentSheet the saved document does -- before this is
  // saved, not just after. It also appears in the totals block and in the
  // "Due on signature" summary line, so match the first occurrence rather
  // than requiring the text to be unique on the page.
  await expect(page.getByText(/1,440\.00|1 440,00/).first()).toBeVisible();

  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/en\/finance\/quotes\/[0-9a-f-]{36}$/);

  // And the same figure on the saved document, from the database.
  await expect(
    main(page)
      .getByText(/1,440\.00|1 440,00/)
      .first(),
  ).toBeVisible();
});

test("a figure that is not a figure is refused, not read as zero", async ({ page }) => {
  await page.goto("/en/finance/quotes");
  await page.getByRole("link", { name: "New quote" }).click();

  await page.getByRole("textbox", { name: "What it is for" }).fill("Bad money");
  await page.getByLabel("Company", { exact: true }).selectOption({ label: "Kestrel Partners" });
  await page.getByLabel("Description 1").fill("Something");
  await page.getByLabel("Unit price 1").fill("about four thousand");

  // The running total refuses to guess -- a line whose price does not parse
  // is left out of the preview entirely, which is what keeps Create disabled
  // rather than lets the server catch it after a round trip.
  await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
  await expect(page.getByText(/Complete the required fields/)).toBeVisible();
});

test("every document gets its own number, and numbers are not reused", async ({ page }) => {
  const numbers: string[] = [];

  for (const round of [1, 2]) {
    await page.goto("/en/finance/quotes");
    await page.getByRole("link", { name: "New quote" }).click();

    await page
      .getByRole("textbox", { name: "What it is for" })
      .fill(`Numbering ${round} ${Date.now()}`);
    await page.getByLabel("Company", { exact: true }).selectOption({ label: "Kestrel Partners" });
    await page.getByLabel("Description 1").fill("A line");
    await page.getByLabel("Unit price 1").fill("100");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/en\/finance\/quotes\/[0-9a-f-]{36}$/);
    const number = await main(page).locator("p").first().textContent();
    numbers.push((number ?? "").trim());
  }

  expect(numbers[0]).toMatch(/^Q-\d{4}-\d{4}$/);
  expect(numbers[1]).not.toBe(numbers[0]);
});

test("a part payment leaves the rest owed", async ({ page }) => {
  await page.goto("/en/finance/invoices");

  // The Harbour deposit is sent and unpaid.
  await main(page)
    .getByRole("link", { name: /Onboarding revamp, deposit/ })
    .click();
  await expect(page).toHaveURL(/\/en\/finance\/invoices\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await dialog.getByLabel("Amount").fill("1 000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // Part paid, not paid: the status follows the arithmetic rather than a
  // checkbox somebody forgets to tick.
  await expect(main(page).getByText("Part paid").first()).toBeVisible();
  await expect(main(page).getByText("Still owed").first()).toBeVisible();
});

test("a sent invoice is voided, never deleted", async ({ page }) => {
  await page.goto("/en/finance/invoices");

  // The seeded void keeps its number and its reason.
  const voided = main(page).getByRole("link", { name: /Retainer, September/ });
  await expect(voided).toBeVisible();
  await voided.click();

  await expect(main(page).getByText("Void").first()).toBeVisible();
  await expect(main(page).getByText(/Issued against the old retainer rate/)).toBeVisible();
});

test("voiding asks why", async ({ page }) => {
  await page.goto("/en/finance/invoices");
  await main(page)
    .getByRole("link", { name: /Campaign assets, first batch/ })
    .click();

  await page.getByRole("button", { name: "Void invoice…" }).click();
  const dialog = page.getByRole("dialog", { name: "Void this invoice?" });

  await expect(dialog.getByRole("button", { name: "Void invoice…" })).toBeDisabled();
  await dialog.getByLabel("Why").fill("Raised against the wrong project.");
  await dialog.getByRole("button", { name: "Void invoice…" }).click();
  await expect(dialog).toBeHidden();

  await expect(main(page).getByText("Raised against the wrong project.")).toBeVisible();
});

test("an accepted quote becomes a project, with its lines as tasks", async ({ page }) => {
  await page.goto("/en/finance/quotes");

  // The Harbour onboarding quote is seeded as accepted.
  await main(page)
    .getByRole("link", { name: /Onboarding revamp/ })
    .click();
  await expect(main(page).getByText("Accepted").first()).toBeVisible();

  await page.getByRole("button", { name: "Turn into a project" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Turn this quote into a project",
  });

  // Letters only: a project key is two to five letters, and a key with
  // digits in it is refused -- correctly.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const key = `Z${letters[Math.floor(Math.random() * 26)]}${letters[Math.floor(Math.random() * 26)]}`;
  await dialog.getByLabel("Key").fill(key);
  await dialog.getByRole("button", { name: "Create the project" }).click();

  // It lands on the project, and the quote lines are the tasks -- the join
  // that used to be retyping.
  await expect(page).toHaveURL(new RegExp(`/en/work/${key}$`));
  await page.getByRole("tab", { name: "Tasks" }).click();
  await expect(main(page).getByText("Service design workshops")).toBeVisible();
  await expect(main(page).getByText("Handover and training")).toBeVisible();
});

test("an expense somebody paid for themselves can be reimbursed", async ({ page }) => {
  await page.goto("/en/finance/expenses");

  const row = main(page).getByRole("listitem").filter({ hasText: "Train to Lyon" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark reimbursed" }).click();

  await expect(row.getByText("Reimbursed")).toBeVisible();
});

test("a manager without the module sees none of it", async ({ browser }) => {
  const managerContext = await browser.newContext({
    storageState: "e2e/.auth/manager.json",
  });
  const managerPage = await managerContext.newPage();

  await managerPage.goto("/en/finance");

  // 403, not 401: what the company is owed is the most sensitive data here,
  // and the session survives being refused it.
  await expect(managerPage.getByRole("heading", { name: "Finance", level: 1 })).toHaveCount(0);
  await managerPage.goto("/en/today");
  await expect(managerPage.getByRole("heading", { level: 1 })).toBeVisible();

  await managerContext.close();
});

test("the money is on the rail of the person who can see it", async ({ page }) => {
  await page.goto("/en/today");

  // The fault this exists to catch: Finance shipped as a route, a permission
  // and a palette entry, and for one commit the only way to reach it was to
  // know its name. That is the same fault the sales rail was added to fix, and
  // it hit the owner and the operations lead hardest -- both hold `crm` too,
  // so the pipeline rail had claimed them.
  const rail = page.getByRole("navigation", { name: "Primary" }).first();
  await expect(rail.getByRole("link", { name: "Finance" })).toBeVisible();

  // Five primary destinations, and these five: `railFor` throws above the
  // cap, so what is worth asserting here is which ones won the slots. The
  // rail also carries this person's channels, nested under Work -- those are
  // children of a destination rather than destinations, which is the whole
  // reason they are allowed to exist.
  //
  // Anchored with an optional count rather than `exact`, because Inbox wears
  // its unread badge inside the link: its accessible name is `Inbox 3` the
  // moment anything is waiting, which is most of the time once the rest of
  // the suite has run.
  for (const name of ["Today", "Finance", "Work", "People", "Inbox"]) {
    const label = new RegExp(String.raw`^${name}( \d+)?$`);
    await expect(rail.getByRole("link", { name: label })).toBeVisible();
  }
  for (const name of ["Insights", "Pipeline"]) {
    await expect(rail.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
});

test("and off the rail of somebody who cannot", async ({ browser }) => {
  const managerContext = await browser.newContext({
    storageState: "e2e/.auth/manager.json",
  });
  const managerPage = await managerContext.newPage();

  await managerPage.goto("/en/today");
  const rail = managerPage.getByRole("navigation", { name: "Primary" }).first();
  await expect(rail.getByRole("link", { name: "Insights" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Finance" })).toHaveCount(0);

  await managerContext.close();
});

test.describe("accessible, and never scrolling the page sideways", () => {
  for (const route of FINANCE_ROUTES) {
    test(`axe: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("#main")).toBeVisible();
      await expectNoAxeViolations(page, route);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const route of FINANCE_ROUTES) {
        await page.goto(route);
        await expect(page.locator("#main")).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});
