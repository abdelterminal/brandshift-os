import { expect, test, type Page } from "@playwright/test";

/**
 * The playbook: what reaching a stage sets up.
 *
 * What is worth protecting:
 *
 * 1. **Configuring a stage sticks.** A template and a set of document kinds,
 *    saved per stage, still there on reload.
 * 2. **"Set up this stage" instantiates it** -- the template's tasks land on
 *    the project with dates, a blank document appears per expected kind, and
 *    the button is then gone. A second setup of the same stage is refused.
 * 3. **The wizard's "start on the delivery flow" checkbox** runs onboarding's
 *    setup as part of creating the project.
 */

const main = (page: Page) => page.locator("#main");

/** A 2-5 letter key, letters only (the wizard rejects digits), unlikely to clash. */
const uniqueKey = () => {
  let n = Date.now();
  let key = "F";
  for (let i = 0; i < 3; i += 1) {
    key += String.fromCharCode(65 + (n % 26));
    n = Math.floor(n / 26);
  }
  return key;
};

async function configureStage(page: Page, stage: string, template: string, kind: string) {
  await page.goto("/en/playbook");
  const row = main(page).getByRole("heading", { name: stage, level: 2 }).locator("..").locator("..");
  await row.getByLabel("Task template").selectOption({ label: template });
  await row.getByRole("checkbox", { name: kind }).check();

  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200);
  await row.getByRole("button", { name: "Save" }).click();
  await saved;
  await page.waitForLoadState("networkidle");
}

test("configuring a stage sticks across a reload", async ({ page }) => {
  await configureStage(page, "Planning", "Film project", "Brief");

  await page.reload();
  const row = main(page)
    .getByRole("heading", { name: "Planning", level: 2 })
    .locator("..")
    .locator("..");
  await expect(row.getByLabel("Task template")).toHaveValue(/.+/);
  await expect(row.getByRole("checkbox", { name: "Brief" })).toBeChecked();
});

test("Set up this stage instantiates the template and the document stubs", async ({ page }) => {
  await configureStage(page, "Strategy", "Film project", "Marketing system");

  // Put a project into that stage.
  await page.goto("/en/work/MER");
  await page.getByRole("tab", { name: "Overview" }).click();
  const setStage = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.status() === 200,
  );
  await main(page).getByRole("combobox", { name: "Set the stage" }).selectOption("strategy");
  await setStage;
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("tab", { name: "Overview" }).click();

  const setup = page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200);
  await main(page).getByRole("button", { name: "Set up this stage" }).click();
  await setup;
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.getByRole("tab", { name: "Overview" }).click();

  // The button is gone, a done note in its place.
  await expect(main(page).getByRole("button", { name: "Set up this stage" })).toHaveCount(0);
  await expect(main(page).getByText("This stage has been set up.")).toBeVisible();

  // The template's tasks are on the Tasks tab.
  await page.getByRole("tab", { name: "Tasks" }).click();
  await expect(main(page).getByText("Kickoff with the client")).toBeVisible();
  await expect(main(page).getByText("Shoot")).toBeVisible();

  // The blank document stub is on the Docs tab.
  await page.getByRole("tab", { name: "Docs" }).click();
  await expect(main(page).getByText("Marketing system — Meridian rebrand")).toBeVisible();
});

test("the wizard can start a project straight onto the flow", async ({ page }) => {
  await configureStage(page, "Onboarding", "Website handover", "Brief");

  await page.goto("/en/work/new");
  const key = uniqueKey();
  await main(page).locator('input[name="name"]').fill("Flow launch test");
  await main(page).locator("#project-key").fill(key);

  // Walk to the review step, skipping the optional ones.
  const next = main(page).getByRole("button", { name: "Continue" });
  await expect(next).toBeEnabled();
  await next.click();
  for (let i = 0; i < 3; i += 1) {
    await main(page).getByRole("button", { name: "Skip for now" }).click();
  }
  await expect(main(page).getByRole("heading", { name: "Ready to publish" })).toBeVisible();

  await main(page).getByRole("checkbox", { name: "Start this project on the delivery flow" }).check();
  await main(page).getByRole("button", { name: "Publish project" }).click();

  await page.waitForURL(new RegExp(`/en/work/${key}$`));
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(main(page).getByRole("combobox", { name: "Set the stage" })).toHaveValue("onboarding");
  await expect(main(page).getByText("This stage has been set up.")).toBeVisible();

  await page.getByRole("tab", { name: "Tasks" }).click();
  await expect(main(page).getByText("Transfer domain and hosting")).toBeVisible();

  await page.getByRole("tab", { name: "Docs" }).click();
  await expect(main(page).getByText("Brief — Flow launch test")).toBeVisible();
});
