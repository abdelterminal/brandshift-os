import { expect, test } from "@playwright/test";

import { MANAGER, MEMBER, SEED_PASSWORD } from "../people";

/**
 * The front door.
 *
 * These are the paths where a regression is worst: not being able to get in,
 * or being able to get in without credentials.
 */

test.describe("signed out", () => {
  test("sends you to sign in, remembering where you were going", async ({ page }) => {
    await page.goto("/en/work");

    await expect(page).toHaveURL(/\/en\/login\?next=%2Fwork/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("redirects the bare root to a locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("refuses a wrong password without saying which half was wrong", async ({ page }) => {
    await page.goto("/en/login");

    await page.getByLabel("Email").fill(MANAGER.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const error = page.getByText("That email and password do not match.");
    await expect(error).toBeVisible();

    // The message must not distinguish a missing account from a wrong
    // password; that difference is an account enumeration oracle.
    await expect(page.getByText(/no such|not found|unknown user/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("refuses an unknown email with exactly the same message", async ({ page }) => {
    await page.goto("/en/login");

    await page.getByLabel("Email").fill("nobody@brandshift.test");
    await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("That email and password do not match.")).toBeVisible();
  });

  test("keeps what was typed, except the password", async ({ page }) => {
    await page.goto("/en/login");

    await page.getByLabel("Email").fill(MANAGER.email);
    await page.getByLabel("Password", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("That email and password do not match.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(MANAGER.email);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("signs in and lands where it was asked to", async ({ page }) => {
    await page.goto("/en/login?next=%2Fpeople");

    await page.getByLabel("Email").fill(MANAGER.email);
    await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/en/people");
    await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();
  });

  test("ignores an absolute URL in ?next=", async ({ page }) => {
    // The classic open redirect on a sign-in link: sign in on the real site,
    // get handed to somebody else's.
    await page.goto("/en/login?next=https%3A%2F%2Fexample.com%2Fowned");

    await page.getByLabel("Email").fill(MANAGER.email);
    await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/en/today");
    expect(new URL(page.url()).host).toBe(new URL(page.url()).host);
    await expect(page).toHaveURL(/localhost:\d+\/en\/today/);
  });
});

test.describe("the password field", () => {
  test("has a real label and a named visibility toggle", async ({ page }) => {
    await page.goto("/en/login");

    // A real <label for>, not placeholder text that vanishes on typing.
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");

    const toggle = page.getByRole("button", { name: "Show password" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

/**
 * A signed cookie whose session row is gone.
 *
 * This is the one path the middleware deliberately does not catch: it checks a
 * signature, not the database, so a revoked session gets waved through and the
 * page refuses it. Which means `unauthorized.tsx` is the *only* thing standing
 * between somebody and a dead end -- and for several milestones it was never
 * reached at all.
 *
 * `requireUser()` throws from inside `(app)/layout.tsx`, and a boundary covers
 * a segment's children rather than that segment's own layout, so the file sat
 * in `(app)/` catching nothing while Next's built-in page rendered instead:
 * "You're not authorized to access this page", which reads like a permissions
 * refusal rather than an expired session.
 *
 * Nothing caught it because the tests around it asserted what should *not* be
 * on screen. This one names the words that should be.
 */
test("a session revoked from another device explains itself", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();

  for (const context of [first, second]) {
    const page = await context.newPage();
    await page.goto("/en/login");
    await page.getByLabel("Email").fill(MEMBER.email);
    await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/en/today");
  }

  // The second browser signs the first one out.
  const settings = await second.newPage();
  await settings.goto("/en/settings");
  // Only the current device shows by default; the other device -- what this
  // test needs to revoke -- is behind "Show all devices".
  await settings.getByRole("button", { name: /Show all devices/ }).click();
  const other = settings.locator("li").filter({ hasNot: settings.getByText("This device") });
  await other.getByRole("button", { name: "Sign out" }).first().click();

  // The first browser still holds a cookie that is signed and unexpired, so
  // the middleware lets it through and the page has to explain.
  const stranded = (await first.pages())[0]!;
  const response = await stranded.goto("/en/today");
  expect(response?.status()).toBe(401);

  await expect(stranded.getByRole("heading", { name: "You are signed out" })).toBeVisible();
  await expect(stranded.getByText(/signed out from another device/)).toBeVisible();

  // And it is a way back, not a wall: the button works, and the cookie has
  // been cleared on the way so signing in again is the whole journey.
  await stranded.getByRole("link", { name: "Sign in" }).click();
  await expect(stranded).toHaveURL(/\/en\/login/);

  await first.close();
  await second.close();
});
