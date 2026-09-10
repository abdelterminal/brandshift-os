import { expect, test, type Page } from "@playwright/test";

/**
 * The delivery flow: stages on projects, the pipeline board, and documents.
 *
 * What is worth protecting:
 *
 * 1. **Setting a stage on a project puts it on the pipeline board**, and it
 *    survives a reload -- the write landed, not just the local select state.
 * 2. **The board's chevrons move a project between stages** -- the pointer-free
 *    path, which is what keeps the board reachable from the keyboard.
 * 3. **A document can be written**, and its sections render with their breaks.
 * 4. The list / pipeline toggle is on both Work views.
 */

const main = (page: Page) => page.locator("#main");

async function setStage(page: Page, key: string, stage: string) {
  await page.goto(`/en/work/${key}`);
  await page.getByRole("tab", { name: "Overview" }).click();
  const select = main(page).getByRole("combobox", { name: "Set the stage" });

  // The change runs in a transition -- a Server Action POST, then the router
  // refetch. Wait for both to land before reloading, or the reload races them.
  const action = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.status() === 200,
  );
  await select.selectOption(stage);
  await action;
  await page.waitForLoadState("networkidle");

  await page.reload();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(main(page).getByRole("combobox", { name: "Set the stage" })).toHaveValue(stage);
}

test("a stage on a project puts it on the pipeline and survives a reload", async ({ page }) => {
  await setStage(page, "MER", "strategy");

  await page.goto("/en/work/pipeline");
  const strategy = main(page).getByRole("region", { name: "Strategy" });
  await expect(strategy.getByText("Meridian rebrand")).toBeVisible();

  // Clear it -- off the board.
  await setStage(page, "MER", "");
  await page.goto("/en/work/pipeline");
  await expect(main(page).getByText("Meridian rebrand")).toHaveCount(0);
});

test("the board's chevrons walk a project one stage at a time", async ({ page }) => {
  await setStage(page, "ATL", "planning");

  await page.goto("/en/work/pipeline");
  const planning = main(page).getByRole("region", { name: "Planning" });
  await expect(planning.getByText("Atlas design system")).toBeVisible();

  await planning
    .getByRole("article")
    .filter({ hasText: "Atlas design system" })
    .getByRole("button", { name: "Production" })
    .click();

  await expect(
    main(page).getByRole("region", { name: "Production" }).getByText("Atlas design system"),
  ).toBeVisible();

  await setStage(page, "ATL", "");
});

test("a document can be written and its sections render", async ({ page }) => {
  const title = `Studio note ${Date.now()}`;

  await page.goto("/en/documents");
  await expect(main(page).getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "New document" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Heading 1").fill("Before the first call");
  await dialog.getByLabel("Body 1").fill("Confirm the scope in writing.\nSet up the folder.");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/documents\/studio-note-\d+$/);
  await expect(main(page).getByRole("heading", { name: title })).toBeVisible();
  await expect(main(page).getByText("Before the first call")).toBeVisible();
  await expect(main(page).getByText("Set up the folder.")).toBeVisible();
});

test("the list / pipeline toggle is on both Work views", async ({ page }) => {
  await page.goto("/en/work");
  await expect(main(page).getByRole("link", { name: "Pipeline" })).toBeVisible();

  await page.goto("/en/work/pipeline");
  await expect(main(page).getByRole("link", { name: "List" })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();
});
