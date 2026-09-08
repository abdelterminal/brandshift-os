import { expect, test } from "@playwright/test";

/**
 * Guided project creation.
 *
 * The two things worth protecting: that nothing is written before Publish, and
 * that Publish writes the project, its team and its deliverables together.
 */

/** A fresh key per run, so a retry does not collide with its own first attempt. */
function uniqueKey(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * 26)]).join("");
}

test("walks five steps and publishes in one go", async ({ page }) => {
  const key = uniqueKey();
  await page.goto("/en/work/new");

  // 1. Essentials. Continue stays disabled until there is a name and a key.
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeDisabled();

  await page.getByLabel("Project name").fill("Cobalt brand sprint");
  await page.getByLabel("Key").fill(key);
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  // 2. Department.
  await page.getByLabel("Which department owns it?").selectOption({ label: "Engineering" });
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Assignment -- the step that exists to show workload before you add to it.
  await expect(page.getByRole("heading", { name: "Who is on it?" })).toBeVisible();
  await expect(page.getByText(/open tasks?|free/).first()).toBeVisible();
  const people = page.getByRole("checkbox");
  await people.first().check();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Deliverables.
  await page
    .getByLabel("What has to be delivered?")
    .fill("Discovery workshop\nBrand audit\nConcept directions");
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Review. Nothing exists yet.
  await expect(page.getByRole("heading", { name: "Ready to publish" })).toBeVisible();
  await expect(page.getByText("Cobalt brand sprint")).toBeVisible();
  await expect(page.getByText("Discovery workshop")).toBeVisible();

  await page.getByRole("button", { name: "Publish project" }).click();

  // It lands on the project it just made.
  await page.waitForURL(`**/en/work/${key}`);
  await expect(page.getByRole("heading", { name: "Cobalt brand sprint" })).toBeVisible();

  // The deliverables became tasks, in the same transaction.
  await expect(page.getByText("0 of 3 done")).toBeVisible();

  await page.getByRole("tab", { name: "Tasks" }).click();
  for (const title of ["Discovery workshop", "Brand audit", "Concept directions"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});

test("refuses a key another project already uses", async ({ page }) => {
  await page.goto("/en/work/new");

  await page.getByLabel("Project name").fill("Duplicate key attempt");
  // NOR is seeded.
  await page.getByLabel("Key").fill("NOR");

  // Nothing optional gets filled in on the way through, so the advance button
  // honestly reads "Skip for now" rather than "Continue" once past the first
  // step (see new-project-wizard.tsx) -- either is the same action here.
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();
  }
  await page.getByRole("button", { name: "Publish project" }).click();

  // It comes back to the step that owns the field, with the field named.
  await expect(page.getByText("Another project already uses that key.")).toBeVisible();
});
