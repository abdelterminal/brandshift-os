import { expect, test, type Page } from "@playwright/test";

/**
 * Letting the people on a project plan their own work, and the signal when
 * nobody has.
 *
 * Two things worth protecting:
 *
 * 1. Anyone connected to a project's work -- not just a manager -- can add a
 *    task to it, with `createTask()` now wired to a real "New task" dialog.
 * 2. A project member with nothing of their own on the board shows "No tasks
 *    here yet" wherever they look -- their own project, their own Today --
 *    and the fact disappears the moment they add one.
 */

const main = (page: Page) => page.locator("#main");

/** A fresh key per run, so a retry does not collide with its own first attempt. */
function uniqueKey(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * 26)]).join("");
}

async function createTask(page: Page, title: string) {
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  const done = page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200);
  await dialog.getByRole("button", { name: "Create task" }).click();
  await done;
  await expect(dialog).toBeHidden();
}

test("a contributor can add a task to their own project", async ({ browser }) => {
  // Lukas is a contributor on NOR, not its lead or owner -- exactly the
  // population this is for.
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  try {
    await page.goto("/en/work/NOR");
    await page.getByRole("tab", { name: "Tasks" }).click();

    const title = `Set up the CDN cache rules ${Date.now()}`;
    await createTask(page, title);

    await page.reload();
    await page.getByRole("tab", { name: "Tasks" }).click();
    await expect(main(page).getByText(title, { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a newly-unplanned project shows the banner, and adding a task clears it", async ({
  page,
  browser,
}) => {
  const key = uniqueKey();

  // The manager builds a project with Lukas on it and no deliverables typed
  // -- so nobody, not even the owner, has a task of their own yet.
  await page.goto("/en/work/new");
  await page.getByLabel("Project name").fill("Plan check sprint");
  await page.getByLabel("Key").fill(key);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Which department owns it?").selectOption({ label: "Engineering" });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Who is on it?" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Lukas Weber" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Deliverables: left empty on purpose.
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Ready to publish" })).toBeVisible();
  await page.getByRole("button", { name: "Publish project" }).click();
  await page.waitForURL(`**/en/work/${key}`);

  // The manager who built it is unplanned on it too.
  await expect(main(page).getByText("No tasks here yet")).toBeVisible();

  // Lukas, visiting separately, sees the same fact.
  const lukasCtx = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const lukas = await lukasCtx.newPage();

  try {
    await lukas.goto(`/en/work/${key}`);
    await expect(main(lukas).getByText("No tasks here yet")).toBeVisible();

    // He gives himself a task -- the banner is gone on his own next look.
    await lukas.getByRole("tab", { name: "Tasks" }).click();
    await createTask(lukas, "Wire up the API client");
    await lukas.reload();
    await expect(main(lukas).getByText("No tasks here yet")).toHaveCount(0);
  } finally {
    await lukasCtx.close();
  }
});
