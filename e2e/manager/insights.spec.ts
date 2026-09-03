import { expect, test, type Page } from "@playwright/test";

/**
 * Insights.
 *
 * The two rules this screen exists to obey are the two worth testing, because
 * both are easy to break by adding one well-meaning widget:
 *
 * 1. **Exceptions first, no vanity totals.** The first thing on the page is
 *    what has gone wrong, and every row of it goes somewhere you can act.
 * 2. **Nothing invented.** Every number traces to a row somebody made by using
 *    the app -- so completing a task moves the figure, and blocking one moves
 *    a different figure.
 *
 * Plus the permission, which is the other half of a rule already written in
 * `authz.ts`: what the rail hides, the URL refuses.
 */

const main = (page: Page) => page.locator("#main");

test("opens with what has gone wrong, and every row leads somewhere", async ({ page }) => {
  await page.goto("/en/insights");

  await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();

  // The first section on the page. Not a total, not a chart.
  const headings = main(page).getByRole("heading", { level: 2 });
  await expect(headings.first()).toHaveText("At risk");

  const first = main(page).getByRole("listitem").first().getByRole("link");
  await first.click();
  await expect(page).toHaveURL(/\/en\/work\//);
});

test("a blocked task is on the stuck list, and clears when it is unblocked", async ({ page }) => {
  await page.goto("/en/insights");

  const stuck = main(page).locator("section", {
    has: page.getByRole("heading", { name: "Stuck longest" }),
  });

  // Something is blocked on a seeded database, and the row says what for.
  const firstStuck = stuck.getByRole("listitem").first();
  await expect(firstStuck).toBeVisible();
  const title = (await firstStuck.getByRole("link").textContent()) ?? "";

  // Follow it to the task. A blocked task offers "Clear blocker" -- unblocking
  // it is the whole point of the row, so that is what the drawer leads with.
  await firstStuck.getByRole("link").click();
  await expect(page).toHaveURL(/\?task=/);
  await page.getByRole("button", { name: "Clear blocker" }).click();
  await expect(page.getByRole("button", { name: "Clear blocker" })).toHaveCount(0);

  // And the row is gone, because the list was counted from the task rather
  // than stored anywhere of its own.
  await page.goto("/en/insights");
  const remaining = stuck.getByRole("listitem").filter({ hasText: title.slice(0, 20) });
  await expect(remaining).toHaveCount(0);
});

test("completing a task moves the week it was completed in", async ({ page }) => {
  await page.goto("/en/insights");

  const chart = main(page).locator("table", { has: page.getByText("Week of") });
  const thisWeek = chart.locator("tbody tr").last();
  const before = Number((await thisWeek.locator("td").nth(1).textContent())?.trim() ?? "0");

  // Complete something, anywhere.
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "Open task" }).first().click();
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // The last row is the current week, and it went up by one. Nothing here is
  // cached or precomputed, so the figure is the rows.
  await page.goto("/en/insights");
  await expect(chart.locator("tbody tr").last().locator("td").nth(1)).toContainText(
    String(before + 1),
  );
});

test("the load table counts open work, meetings and time off together", async ({ page }) => {
  await page.goto("/en/insights");

  const table = main(page).locator("table", { has: page.getByText("Meeting hours") });
  await expect(table).toBeVisible();

  // Oscar has parental leave seeded for a fortnight, so his away days are not
  // zero -- which is the only way to tell the column is reading leave at all.
  const oscar = table.locator("tbody tr").filter({ hasText: "Oscar Lindqvist" });
  await expect(oscar).toBeVisible();
  const awayDays = Number((await oscar.locator("td").last().textContent())?.trim() ?? "0");
  expect(awayDays).toBeGreaterThan(0);

  // And a name goes to that person.
  await oscar.getByRole("link").click();
  await expect(page).toHaveURL(/\/en\/people\/[0-9a-f-]{36}$/);
});

test("the numbers are the data, not a picture of it", async ({ page }) => {
  await page.goto("/en/insights");

  // The chart is a real table with a caption, so it is readable without seeing
  // the bars at all. An SVG would not be.
  const chart = main(page).locator("table", { has: page.getByText("Week of") });
  await expect(chart.locator("caption")).toHaveText(/by week/);
  await expect(chart.locator("tbody tr")).toHaveCount(12);
});

test("a member without the module is refused, and keeps their session", async ({ browser }) => {
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  await memberPage.goto("/en/insights");

  // 403, not 401: the session survives, and so does whatever they were doing.
  await expect(memberPage.getByRole("heading", { name: "Insights", level: 1 })).toHaveCount(0);
  await memberPage.goto("/en/today");
  await expect(memberPage.getByRole("heading", { level: 1 })).toBeVisible();

  await memberContext.close();
});
