import { expect, test } from "@playwright/test";

/**
 * The inbox.
 *
 * The behaviour worth protecting is the fan-out rule: you hear about what
 * involves you, and never about what you just did yourself. An inbox that
 * echoes your own actions is one people learn to ignore, and then it swallows
 * the message that mattered.
 */

test("shows what involves you, and clears when read", async ({ page }) => {
  await page.goto("/en/inbox");

  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();

  // The seed fans out with the same rules the app uses, so there is something
  // here on a fresh database.
  const rows = page.getByRole("listitem");
  await expect(rows.first()).toBeVisible();

  const markAll = page.getByRole("button", { name: "Mark all as read" });
  if (await markAll.isVisible()) {
    await markAll.click();
    await expect(page.getByText("All read")).toBeVisible();
    await expect(markAll).toBeHidden();
  }

  // The rail badge is the same number, so it goes too.
  const rail = page.getByRole("navigation", { name: "Primary" }).first();
  const inboxLink = rail.getByRole("link", { name: /Inbox/ });
  await expect(inboxLink).toBeVisible();
  await expect(inboxLink.locator('[data-slot="count-badge"]')).toHaveCount(0);
});

test("a notification opens the thing it is about", async ({ page }) => {
  await page.goto("/en/inbox");

  const first = page.getByRole("listitem").first().getByRole("link");
  await first.click();

  // Every notification lands somewhere you can act, not on a dead end.
  await expect(page).toHaveURL(/\/en\/(work|today)/);
});

test("a blocker reaches the person who runs the project, not the one who reported it", async ({
  page,
  browser,
}) => {
  // Elena runs NOR, so start from a clean slate for her.
  await page.goto("/en/inbox");
  const markAll = page.getByRole("button", { name: "Mark all as read" });
  if (await markAll.isVisible()) await markAll.click();
  await expect(page.getByText("All read")).toBeVisible();

  // Lukas -- a member, not the owner -- reports a blocker on one of her tasks.
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  await memberPage.goto("/en/work/NOR");
  await memberPage.getByRole("tab", { name: "Tasks" }).click();
  await memberPage.getByRole("button", { name: "Open task" }).first().click();
  await memberPage.getByRole("button", { name: "Report blocker" }).click();
  await memberPage.getByLabel("Blocker").fill("Waiting on the vendor to reply.");
  await memberPage.getByRole("button", { name: "Report blocker" }).click();
  await expect(memberPage.getByRole("dialog")).toBeHidden();

  // He reported it, so he is not told about it.
  await memberPage.goto("/en/inbox");
  await expect(memberPage.getByText(/reported a blocker/)).toHaveCount(0);
  await memberContext.close();

  // She runs the project, so she is.
  await page.goto("/en/inbox");
  await expect(page.getByText(/reported a blocker/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeVisible();
});
