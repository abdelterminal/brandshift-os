import { expect, test } from "@playwright/test";

/**
 * Departments, end to end.
 *
 * `/signup` only asks for an organization name -- a fresh org starts with
 * none of these -- and until this there was no way to add one at all: no
 * form, no action, only the seed script. This is the test that the gap is
 * actually closed, and that a department created here is the same one every
 * other screen that reads `listDepartments` sees.
 *
 * In the `finance` project because its fixture is Tom Decker, the admin:
 * `organization.editSettings` needs `admin`, and the manager fixture does not
 * hold it. The directory names the fixture, not the feature.
 */

/** A fresh name each run: two departments sharing a name is allowed (only the
 * slug behind them has to be unique), but a fixed name would make this test
 * order-dependent on whatever an earlier run left behind. */
const freshName = () => `Research ${String(Date.now()).slice(-7)}`;

test("a department can be created, and shows up where departments are used", async ({ page }) => {
  const name = freshName();

  await page.goto("/en/settings");
  await page.getByRole("button", { name: "New department" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Description").fill("A department this test made up.");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();

  // Listed on the panel that created it, with its description. Scoped to
  // #main rather than the whole page: the rail picks up the same name the
  // moment this closes (below), so an unscoped getByText is ambiguous the
  // instant that works.
  const main = page.locator("#main");
  await expect(main.getByText(name)).toBeVisible();
  await expect(main.getByText("A department this test made up.")).toBeVisible();

  // The rail itself, with no navigation and no reload: router.refresh() after
  // creating one is what makes a department usable the moment it exists,
  // rather than on the next page you happen to load.
  await expect(
    page.locator('nav[data-tour="rail"]').getByRole("link", { name }),
  ).toBeVisible();

  // And where a department is actually used: the People filter and the
  // invite dialog's picker both read the same `listDepartments`, so a
  // department that only appeared on the panel that made it would still
  // leave every other screen with no way to assign anyone to it.
  await page.goto("/en/people");
  await expect(page.locator("option", { hasText: name })).toHaveCount(1);

  await page.getByRole("button", { name: "Invite someone" }).first().click();
  await expect(page.getByRole("dialog").locator("option", { hasText: name })).toHaveCount(1);
});

test("creating a department requires a real name", async ({ page }) => {
  await page.goto("/en/settings");
  await page.getByRole("button", { name: "New department" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("x");
  await dialog.getByRole("button", { name: "Create" }).click();

  // Refused, not silently accepted: the dialog stays open with the field
  // marked invalid rather than creating a department named "x".
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
});

test("a manager without organization.editSettings cannot see or reach it", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const page = await context.newPage();

  await page.goto("/en/settings");
  await expect(page.locator("#main").getByText("Departments")).toHaveCount(0);

  await context.close();
});
