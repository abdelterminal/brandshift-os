import { expect, test, type Page } from "@playwright/test";

/**
 * Invitations, end to end.
 *
 * Before this there was no token, no accept route and no reset: an invited
 * person was created with a password hash nothing could match and had no way
 * in at all, while the sign-up form said "you get in by invitation". This is
 * the test that the sentence is now true.
 *
 * On this deployment nothing is delivered -- a local network has no mail
 * server -- so the outbox *is* the delivery mechanism, and it has to carry the
 * link in full.
 *
 * In the `finance` project because its fixture is Tom Decker, the admin: the
 * manager fixture holds neither `admin` nor the `people` module, so she cannot
 * invite anybody and every one of these would time out waiting for a button
 * she is correctly not shown. The directory names the fixture, not the feature.
 */

const main = (page: Page) => page.locator("#main");

/** A fresh address each run: an invitation is refused for an existing member. */
const freshEmail = () => `newcomer${String(Date.now()).slice(-7)}@brandshift.test`;

async function invite(page: Page, email: string, name = "Newcomer Test") {
  await page.goto("/en/people");
  await page.getByRole("button", { name: "Invite someone" }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Add to organization" }).click();
  await expect(dialog).toBeHidden();
}

/** The accept link, read out of the outbox exactly as an admin would. */
async function linkFromOutbox(page: Page, email: string): Promise<string> {
  await page.goto("/en/settings");

  const row = main(page).locator("li", { hasText: email }).first();
  await row.getByRole("button", { name: "Show message" }).click();
  // The body renders on a state change, so reading the row straight after the
  // click can beat React to it.
  await expect(row.locator("pre")).toBeVisible();

  const body = await row.innerText();
  const match = body.match(/https?:\/\/[^\s]+\/en\/accept\/[A-Za-z0-9_-]+/);
  expect(match, "the invitation body should carry an accept link").not.toBeNull();

  // The message is written with `APP_URL`, which is not the port the tests run
  // on. Following it is the point; the host is configuration.
  return match![0].replace(/:\d+/, `:${new URL(page.url()).port}`);
}

test("an invitation is written to the outbox, with its link", async ({ page }) => {
  const email = freshEmail();
  await invite(page, email);

  await page.goto("/en/settings");
  await expect(main(page).getByText(email)).toBeVisible();

  // Recorded, and honestly not sent: saying "sent" when nothing left the
  // building is the one lie this system must not tell.
  await expect(main(page).getByText("Recorded, not sent").first()).toBeVisible();
});

test("the link gets an invited person in, and activates them", async ({ page, browser }) => {
  const email = freshEmail();
  await invite(page, email);
  const link = await linkFromOutbox(page, email);

  // An explicitly anonymous context: `browser.newContext()` alone inherits the
  // project's storage state, so the first version of this arrived already
  // signed in as the admin -- which is also how it turned up that a signed-in
  // visitor was being bounced off the accept page entirely.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const invited = await context.newPage();

  await invited.goto(link);
  await expect(invited.getByRole("heading", { name: "Choose a password" })).toBeVisible();

  await invited.getByLabel("Password", { exact: true }).fill("a-long-enough-password");
  await invited.getByLabel("Confirm password").fill("a-long-enough-password");
  await invited.getByRole("button", { name: /Set password/ }).click();

  // Signed straight in: they chose the password a second ago and proved they
  // hold the address. Asking them to type it again is a rite of passage.
  await expect(invited).toHaveURL(/\/en\/today$/);

  await context.close();
});

test("the link works once", async ({ page, browser }) => {
  const email = freshEmail();
  await invite(page, email);
  const link = await linkFromOutbox(page, email);

  const first = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const one = await first.newPage();
  await one.goto(link);
  await one.getByLabel("Password", { exact: true }).fill("a-long-enough-password");
  await one.getByLabel("Confirm password").fill("a-long-enough-password");
  await one.getByRole("button", { name: /Set password/ }).click();
  await expect(one).toHaveURL(/\/en\/today$/);
  await first.close();

  const second = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const two = await second.newPage();
  await two.goto(link);

  // "Used" rather than "invalid": one of those is something a person can act
  // on, and the other sends them to support.
  await expect(two.getByRole("heading", { name: "That link has already been used" })).toBeVisible();
  await second.close();
});

test("a link nobody minted is refused without saying why not", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto("/en/accept/not-a-real-token-but-long-enough-to-pass");
  await expect(page.getByRole("heading", { name: "That link is not valid" })).toBeVisible();

  // It reveals nothing about whether any address exists -- you cannot reach
  // this page without already holding a token.
  await expect(page.getByText(/@/)).toHaveCount(0);
  await context.close();
});

test("the two halves of the password have to match", async ({ page, browser }) => {
  const email = freshEmail();
  await invite(page, email);
  const link = await linkFromOutbox(page, email);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const invited = await context.newPage();
  await invited.goto(link);

  await invited.getByLabel("Password", { exact: true }).fill("a-long-enough-password");
  await invited.getByLabel("Confirm password").fill("a-different-password");
  await invited.getByRole("button", { name: /Set password/ }).click();

  await expect(invited.getByRole("alert").filter({ hasText: /match/ })).toBeVisible();
  // And the token is still unspent, so they can try again.
  await expect(invited.getByLabel("Password", { exact: true })).toBeVisible();

  await context.close();
});

test("a member cannot read the outbox", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await context.newPage();

  await memberPage.goto("/en/settings");

  // Bodies carry links that set passwords, so the panel is behind
  // `member.invite` rather than being shown to everyone who can reach Settings.
  await expect(memberPage.locator("#main").getByText("Outbox")).toHaveCount(0);
  await context.close();
});
