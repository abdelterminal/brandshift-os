import { expect, test, type Page } from "@playwright/test";

/**
 * Weekly reviews.
 *
 * What is worth protecting, in the order it would cost most:
 *
 * 1. **Publishing freezes the numbers.** A review is a document; opening last
 *    quarter's and finding this quarter's figures in it would be worse than
 *    useless, because the room never saw those.
 * 2. **The weeks nobody wrote up are the point of the screen.** A list of the
 *    reviews you did hold is a diary.
 * 3. A decision carries an owner, and comes back when its date passes.
 * 4. A week cannot be reviewed until it has ended.
 */

const main = (page: Page) => page.locator("#main");

test("opens with what was skipped, not with what was done", async ({ page }) => {
  await page.goto("/en/reviews");

  await expect(main(page).getByRole("heading", { name: "Weekly reviews", level: 1 })).toBeVisible();

  // Seeded with a deliberate hole: two reviews with a week missing between.
  await expect(main(page).getByRole("heading", { name: "Weeks with no review" })).toBeVisible();
});

test("brings back a decision whose date has passed", async ({ page }) => {
  await page.goto("/en/reviews");

  // The thing a review is actually for: it produced a decision, somebody's
  // name is on it, and here it is again whether or not anybody remembered.
  await expect(
    main(page).getByRole("heading", { name: "Decisions past their date" }),
  ).toBeVisible();
  await expect(
    main(page).getByText("Stop starting a shoot before the copy is signed off"),
  ).toBeVisible();
  await expect(
    main(page)
      .getByText(/Sofia Laurent/)
      .first(),
  ).toBeVisible();
});

test("a draft counts live, and publishing freezes what it counted", async ({ page }) => {
  await page.goto("/en/reviews");
  await main(page).locator("a", { hasText: "Draft" }).first().click();
  await expect(page).toHaveURL(/\/en\/reviews\/\d{4}-\d{2}-\d{2}$/);

  // While it is a draft the week is still being counted.
  await expect(
    main(page).getByText("Counted now, and frozen when this is published."),
  ).toBeVisible();

  await page.getByLabel("What went well").fill("A quiet week, which is its own result.");
  await page.getByLabel("Decision 1").fill("Keep Fridays free of client calls");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();

  // Now it is a record, and it says so.
  await expect(main(page).getByText("As they stood when this was published.")).toBeVisible();
  await expect(main(page).getByText("A quiet week, which is its own result.")).toBeVisible();
  await expect(main(page).getByText("Keep Fridays free of client calls")).toBeVisible();

  // The editor is gone: a published review is not edited by typing into it.
  await expect(page.getByLabel("What went well")).toHaveCount(0);
});

test("a published review can be reopened, and the freeze lifts", async ({ page }) => {
  await page.goto("/en/reviews");

  // The oldest seeded one is published.
  await main(page).locator("a", { hasText: "Published" }).last().click();
  await expect(main(page).getByText("As they stood when this was published.")).toBeVisible();

  await page.getByRole("button", { name: "Reopen" }).click();

  await expect(
    main(page).getByText("Counted now, and frozen when this is published."),
  ).toBeVisible();
  await expect(page.getByLabel("What went well")).toBeVisible();
});

test("a week that has not finished cannot be reviewed", async ({ page }) => {
  // The current week's Monday. Addressed directly, since the UI only ever
  // offers the week just gone.
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  await page.goto(`/en/reviews/${weekStart}`);

  // No review exists for it, and none is invented: this is a not-found rather
  // than a page counting a week that is still running. Asserted on the whole
  // document, because the not-found page does not render inside `#main`.
  await expect(page.getByRole("heading", { name: /Week of/ })).toHaveCount(0);
  await expect(page.getByLabel("What went well")).toHaveCount(0);
});

test("a member can read a published review but not write one", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await context.newPage();

  await memberPage.goto("/en/reviews");
  await expect(
    memberPage.locator("#main").getByRole("heading", { name: "Weekly reviews", level: 1 }),
  ).toBeVisible();

  // Reading the record is open to everyone; holding the meeting is not.
  await expect(memberPage.getByRole("button", { name: "Review last week" })).toHaveCount(0);

  await context.close();
});
