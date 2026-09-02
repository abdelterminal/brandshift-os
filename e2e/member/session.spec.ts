import { expect, test } from "@playwright/test";

/**
 * Signing out, and what the session page shows.
 *
 * These run last in their file because signing out invalidates the storage
 * state the rest of the project shares.
 */

test("lists this device under settings", async ({ page }) => {
  await page.goto("/en/settings");

  await expect(page.getByRole("heading", { name: "Signed-in devices" })).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();

  // Revoking your own device is meaningless, so it is not offered.
  const row = page.locator("li", { hasText: "This device" });
  await expect(row.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("signing out revokes the session and refuses the back button", async ({ page }) => {
  await page.goto("/en/today");

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/en/login");

  // The cookie is gone *and* the row is revoked, so returning to a page that
  // was open before does not get back in.
  await page.goto("/en/today");
  await expect(page).toHaveURL(/\/en\/login/);
});
