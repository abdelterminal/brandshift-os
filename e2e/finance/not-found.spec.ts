import { expect, test } from "@playwright/test";

/**
 * A malformed id in the URL.
 *
 * Every id in this schema is a `uuid` column, and Postgres will not compare a
 * uuid to arbitrary text -- it raises, and the request dies as a 500. So
 * `/finance/quotes/not-a-uuid` used to be a server error, which is a lie about
 * what happened: the request was fine, the thing asked for does not exist.
 *
 * This is checked as a status code rather than through the UI because the
 * status is the part that was wrong. A 500 tells a browser, a crawler and an
 * uptime check that the application is broken.
 */

/** Signed in as operations, so a 403 can never be mistaken for a 404. */
const ROUTES = [
  "/en/finance/quotes/not-a-uuid",
  "/en/finance/quotes/not-a-uuid/print",
  "/en/finance/invoices/not-a-uuid",
  "/en/finance/invoices/not-a-uuid/print",
  "/en/crm/deals/not-a-uuid",
  "/en/objectives/not-a-uuid",
  "/en/people/not-a-uuid",
  "/en/calendar/not-a-uuid",
];

for (const route of ROUTES) {
  test(`${route} is a 404, not a 500`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(404);
  });
}

test("the 404 page says the account is fine, and offers a way out", async ({ page }) => {
  await page.goto("/en/finance/quotes/not-a-uuid");

  await expect(page.getByRole("heading", { name: "That page does not exist" })).toBeVisible();
  await expect(page.getByText(/Nothing has gone wrong with your account/)).toBeVisible();

  // Never a dead end.
  await page.getByRole("link", { name: "Back to Today" }).click();
  await expect(page).toHaveURL(/\/en\/today$/);
});

test("a well-formed id that matches nothing is also a 404", async ({ page }) => {
  // The guard must not be the only thing producing 404s -- a real uuid that
  // belongs to nobody has to behave the same way, or the guard is hiding a
  // second bug rather than fixing one.
  const response = await page.goto("/en/finance/quotes/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});

test("an id belonging to another organization is a 404, not a peek", async ({ page }) => {
  // `withOrg()` scopes the lookup, so a valid id from another tenant reads as
  // missing. Worth stating as a test: this is the tenancy boundary, and it
  // should be indistinguishable from any other absent row.
  const response = await page.goto("/en/finance/quotes/11111111-1111-4111-8111-111111111111");
  expect(response?.status()).toBe(404);
});
