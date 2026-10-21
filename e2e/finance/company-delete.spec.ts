import { expect, test, type Page } from "@playwright/test";

/**
 * Deleting a client for good.
 *
 * Signed in as operations, because Tom is the only seeded fixture who is both
 * an admin and holds the `crm` module -- the pair `company.delete` asks for.
 * The spec lives beside the other admin specs in this folder for the same
 * reason `invites` and `departments` do: the folder is the role, not the
 * subject.
 *
 * What is worth protecting:
 *
 * 1. Archiving and deleting are different acts, and the destructive one asks
 *    first and says what it will take with it.
 * 2. A client that has been billed is refused before the database refuses it,
 *    because a foreign-key violation is a 500 where the honest answer is one
 *    sentence.
 */

const main = (page: Page) => page.locator("#main");

test("a client with no billing can be deleted, after saying what goes with it", async ({
  page,
}) => {
  // Made here rather than taken from the seed: the rest of the suite runs
  // against the same database, and a spec that removes seeded data is a spec
  // that breaks whichever one happens to run after it.
  const name = `Disposable ${String(Date.now()).slice(-6)}`;

  await page.goto("/en/crm/companies");
  await main(page).getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();

  // Creating a client lands on it, so there is no list to find it in.
  await expect(page).toHaveURL(/\/en\/crm\/companies\/disposable-/);
  await expect(main(page).getByRole("heading", { name, level: 1 })).toBeVisible();

  // One click arms it, and what it arms says plainly that nothing undoes it.
  await main(page).getByRole("button", { name: "Delete permanently" }).click();
  await expect(main(page).getByText(`Delete ${name} for good?`)).toBeVisible();
  await expect(main(page).getByText(/Nothing undoes this/)).toBeVisible();

  // Backing out leaves the client where it was.
  await main(page).getByRole("button", { name: "Cancel" }).click();
  await expect(main(page).getByRole("heading", { name, level: 1 })).toBeVisible();

  // Arm it again, then confirm. The trigger is replaced by the panel rather
  // than sitting beside it, so the same name matches one button each time.
  await main(page).getByRole("button", { name: "Delete permanently" }).click();
  await main(page).getByRole("button", { name: "Delete permanently" }).click();

  // The page it was on no longer exists, so it goes back to the list.
  await page.waitForURL("**/en/crm/companies");
  await expect(main(page).getByRole("link", { name })).toHaveCount(0);
});

test("a client that has been billed is not offered a delete at all", async ({ page }) => {
  // Meridian carries two invoices. `invoices.companyId` is `restrict`, so the
  // row has to go on existing for them to resolve -- said here, in a
  // sentence, rather than by a button that always refuses.
  await page.goto("/en/crm/companies/meridian-bank");

  await expect(main(page).getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
  await expect(main(page).getByText(/Archive them instead/)).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Archive", exact: true })).toBeVisible();
});
