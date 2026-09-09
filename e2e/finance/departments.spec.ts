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
 * order-dependent on whatever an earlier run left behind. A counter, not just
 * the clock: two calls back to back can land in the same millisecond, and a
 * test that means to create two *differently*-named departments quietly
 * creating two identically-named ones is a false pass waiting to happen. */
let freshNameCount = 0;
const freshName = () => `Research ${String(Date.now()).slice(-7)}${(freshNameCount++).toString().padStart(2, "0")}`;

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

test("a department can be renamed, and the new name shows up where it's used", async ({ page }) => {
  const name = freshName();
  const renamed = freshName();

  await page.goto("/en/settings");
  await page.getByRole("button", { name: "New department" }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Name").fill(name);
  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect(createDialog).toBeHidden();

  const main = page.locator("#main");
  await main.locator("li", { hasText: name }).getByRole("button", { name: "Edit department" }).click();

  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("Name").fill(renamed);
  await editDialog.getByLabel("Description").fill("Renamed by this test.");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toBeHidden();

  await expect(main.getByText(renamed)).toBeVisible();
  await expect(main.getByText("Renamed by this test.")).toBeVisible();
  await expect(main.getByText(name, { exact: true })).toHaveCount(0);

  // Same read as creation's own test: the People filter agrees immediately,
  // under the new name -- not the one the department was made with.
  await page.goto("/en/people");
  await expect(page.locator("option", { hasText: renamed })).toHaveCount(1);
  await expect(page.locator("option", { hasText: name })).toHaveCount(0);
});

test("two departments can share a name -- renaming warns, but doesn't refuse", async ({ page }) => {
  const a = freshName();
  const b = freshName();

  await page.goto("/en/settings");
  for (const name of [a, b]) {
    await page.getByRole("button", { name: "New department" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden();
  }

  const main = page.locator("#main");
  await main.locator("li", { hasText: a }).getByRole("button", { name: "Edit department" }).click();

  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("Name").fill(b);
  // Only a `slug` has to be unique; two departments sharing a display name is
  // allowed, disambiguated elsewhere by a short identifier -- this is a
  // heads-up, not a blocking error, so the field never turns invalid.
  await expect(editDialog.getByText("This name already exists")).toBeVisible();
  await expect(editDialog.getByLabel("Name")).not.toHaveAttribute("aria-invalid", "true");

  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toBeHidden();
  await expect(main.getByText(b)).toHaveCount(2);
});

test("a manager without organization.editSettings cannot see or reach it", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const page = await context.newPage();

  await page.goto("/en/settings");
  await expect(page.locator("#main").getByText("Departments")).toHaveCount(0);

  await context.close();
});
