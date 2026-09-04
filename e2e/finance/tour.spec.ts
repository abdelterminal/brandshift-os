import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The guided tour.
 *
 * Tested through the invite flow rather than against a seeded fixture, because
 * that is the only way somebody actually meets it: a real newcomer accepts an
 * invitation, lands on Today, and is shown around. Seeded staff are marked as
 * onboarded in the seed -- they have been here for months, and leaving them
 * otherwise would put this card in front of every other test on every screen.
 *
 * What is worth protecting:
 *
 * 1. It appears for somebody new, and **only once**.
 * 2. It rings the real element rather than drawing a picture of one.
 * 3. Skipping counts as an answer -- it is not a state to be nagged out of.
 * 4. Escape closes it, and nothing is left ringed afterwards.
 */

const anonymous = { storageState: { cookies: [], origins: [] } };
const tour = (page: Page) => page.locator('[aria-labelledby="tour-title"]');

/** Invite somebody, take the link out of the outbox, and accept it. */
async function newcomer(page: Page, browser: Browser) {
  const email = `tourist${String(Date.now()).slice(-7)}@brandshift.test`;

  await page.goto("/en/people");
  await page.getByRole("button", { name: "Invite someone" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Name").fill("Tourist Test");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Add to organization" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/en/settings");
  const row = page.locator("#main li", { hasText: email }).first();
  await row.getByRole("button", { name: "Show message" }).click();
  await expect(row.locator("pre")).toBeVisible();

  const match = (await row.innerText()).match(
    /https?:\/\/[^\s]+\/(?:en|fr)\/accept\/[A-Za-z0-9_-]+/,
  );
  expect(match, "the invitation should carry a link").not.toBeNull();
  const link = match![0].replace(/:\d+/, `:${new URL(page.url()).port}`);

  const context = await browser.newContext(anonymous);
  const invited = await context.newPage();
  await invited.goto(link);
  await invited.getByLabel("Password", { exact: true }).fill("a-long-enough-password");
  await invited.getByLabel("Confirm password").fill("a-long-enough-password");
  await invited.getByRole("button", { name: /Set password/ }).click();
  await expect(invited).toHaveURL(/\/en\/today$/);

  return { context, invited };
}

test("greets somebody who has just arrived", async ({ page, browser }) => {
  const { context, invited } = await newcomer(page, browser);

  await expect(tour(invited)).toBeVisible();
  await expect(tour(invited)).toContainText("Step 1 of 5");

  // It rings the real rail, not a drawing of one.
  await expect(invited.locator("nav[data-tour-active]")).toHaveCount(1);

  await context.close();
});

test("walks through and rings each thing it describes", async ({ page, browser }) => {
  const { context, invited } = await newcomer(page, browser);
  const card = tour(invited);

  for (let step = 0; step < 3; step += 1) {
    await card.getByRole("button", { name: "Next" }).click();
  }

  await expect(card).toContainText("Step 4 of 5");
  await expect(invited.locator('button[data-tour="palette"][data-tour-active]')).toHaveCount(1);
  // And only one thing is lit at a time.
  await expect(invited.locator("[data-tour-active]")).toHaveCount(1);

  await card.getByRole("button", { name: "Next" }).click();
  await expect(invited.locator('[data-tour="account"][data-tour-active]')).toHaveCount(1);

  await context.close();
});

test("goes for good once it is finished", async ({ page, browser }) => {
  const { context, invited } = await newcomer(page, browser);
  const card = tour(invited);

  for (let step = 0; step < 4; step += 1) {
    await card.getByRole("button", { name: "Next" }).click();
  }
  await card.getByRole("button", { name: "Got it" }).click();

  await expect(card).toHaveCount(0);
  // Nothing is left ringed after it closes.
  await expect(invited.locator("[data-tour-active]")).toHaveCount(0);

  // On the user rather than in localStorage, so it survives a reload -- and
  // would survive them signing in from a different machine.
  await invited.reload();
  await expect(tour(invited)).toHaveCount(0);

  await context.close();
});

test("skipping is an answer, not something to be nagged out of", async ({ page, browser }) => {
  const { context, invited } = await newcomer(page, browser);

  await tour(invited).getByRole("button", { name: "Skip" }).click();
  await expect(tour(invited)).toHaveCount(0);

  await invited.reload();
  await expect(tour(invited)).toHaveCount(0);

  await context.close();
});

test("escape closes it from anywhere", async ({ page, browser }) => {
  const { context, invited } = await newcomer(page, browser);

  await expect(tour(invited)).toBeVisible();
  await invited.keyboard.press("Escape");

  await expect(tour(invited)).toHaveCount(0);
  await expect(invited.locator("[data-tour-active]")).toHaveCount(0);

  await context.close();
});

test("does not appear for somebody who has been here for months", async ({ page }) => {
  // The seeded staff are marked onboarded, which is also what keeps this card
  // off every other test in the suite.
  await page.goto("/en/today");
  await expect(tour(page)).toHaveCount(0);
});
