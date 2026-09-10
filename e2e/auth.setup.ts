import { expect, test as setup } from "@playwright/test";

import { ASSIGNEE, FINANCE, MANAGER, MEMBER, SALES, SEED_PASSWORD } from "./people";

/**
 * Signs in once per role and saves the session.
 *
 * scrypt is deliberately slow, so signing in inside every spec would cost more
 * than the specs themselves. Each role signs in here and the rest of the suite
 * reuses the cookie.
 */

async function signIn(page: import("@playwright/test").Page, email: string, file: string) {
  await page.goto("/en/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Landing on Today is the proof the session exists; waiting for the URL also
  // stops the state being saved before the cookie is set.
  await page.waitForURL("**/en/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await page.context().storageState({ path: file });
}

setup("sign in as a manager", async ({ page }) => {
  await signIn(page, MANAGER.email, "e2e/.auth/manager.json");
});

setup("sign in as a member", async ({ page }) => {
  await signIn(page, MEMBER.email, "e2e/.auth/member.json");
});

setup("sign in as a work assignee", async ({ page }) => {
  await signIn(page, ASSIGNEE.email, "e2e/.auth/assignee.json");
});

setup("sign in as client services", async ({ page }) => {
  await signIn(page, SALES.email, "e2e/.auth/sales.json");
});

setup("sign in as operations", async ({ page }) => {
  await signIn(page, FINANCE.email, "e2e/.auth/finance.json");
});
