import { expect, test, type Page } from "@playwright/test";

/**
 * Password reset, by the only route that exists.
 *
 * These tests used to drive the public `/forgot` form. That form is asleep --
 * `ForgotPage` short-circuits to `/login`, and the login footer says to ask an
 * admin instead -- so every test here now follows the path that actually
 * ships: an admin sends a one-time link from somebody's own page, it is
 * written to the outbox in full, and whoever can read the outbox passes it on.
 * `ForgotForm` and `requestReset` behind it are untouched and still wired, so
 * re-enabling self-service is a revert of one redirect; the day that happens,
 * the enumeration-resistance tests this file used to carry (one answer for
 * every address, a stranger's request writing nothing) come back with it.
 *
 * In the `finance` project because both halves need an admin: sending the
 * link, and reading the outbox it lands in.
 */

const main = (page: Page) => page.locator("#main");

/** No session at all -- `browser.newContext()` alone inherits the project's. */
const anonymous = { storageState: { cookies: [], origins: [] } };

/** The one card on a person's page that sends a link, found by its heading. */
function resetCard(page: Page) {
  return main(page)
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Reset password" }) });
}

/** Open somebody's page from the directory, the way an admin would reach it. */
async function openPerson(page: Page, name: string) {
  await page.goto("/en/people");
  await main(page).getByRole("link", { name }).first().click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Send a reset from that person's page and wait for it to be acknowledged. */
async function sendReset(page: Page, name: string) {
  await openPerson(page, name);

  const card = resetCard(page);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Send reset link" }).click();
  await expect(card.getByRole("status")).toContainText("Sent");
}

/** The link itself, read out of the outbox exactly as an admin would. */
async function linkFromOutbox(page: Page, email: string): Promise<string> {
  await page.goto("/en/settings");

  const row = main(page).locator("li", { hasText: email }).first();
  await row.getByRole("button", { name: "Show message" }).click();
  // The body renders on a state change, so reading the row straight after the
  // click can beat React to it.
  await expect(row.locator("pre")).toBeVisible();

  // Either locale: the message is written in the *recipient's* language, and
  // some of the cast are seeded `fr`. Looking only for `/en/` used to fail
  // here, which was the locale feature working rather than a bug.
  const match = (await row.innerText()).match(
    /https?:\/\/[^\s]+\/(?:en|fr)\/reset\/[A-Za-z0-9_-]+/,
  );
  expect(match, "the reset body should carry a link").not.toBeNull();

  // The seeded origin is not the port this suite runs on.
  return match![0].replace(/:\d+/, `:${new URL(page.url()).port}`);
}

test("self-service is asleep, and says so rather than 404ing", async ({ browser }) => {
  const context = await browser.newContext(anonymous);
  const page = await context.newPage();

  // `/forgot` is still a public path -- it has to be, it is reached by
  // somebody who cannot sign in -- so this is a redirect, not a refusal.
  await page.goto("/en/forgot");
  await expect(page).toHaveURL(/\/en\/login$/);

  // And the screen they land on tells them what to actually do, instead of
  // leaving them on a sign-in form with no way forward.
  await expect(
    page.getByText("Forgotten your password? Ask an admin to send you a reset link."),
  ).toBeVisible();

  // No public form anywhere on it: this is what used to be driven here.
  await expect(page.getByRole("button", { name: "Send the link" })).toHaveCount(0);

  await context.close();
});

test("an admin sends a link, and it is written to the outbox in full", async ({ page }) => {
  const email = "claire.moreau@brandshift.test";

  await sendReset(page, "Claire Moreau");

  // The acknowledgement points at the outbox because that is genuinely where
  // it went -- nothing is delivered on this deployment.
  const link = await linkFromOutbox(page, email);
  expect(link).toMatch(/\/reset\/[A-Za-z0-9_-]+$/);
});

test("the link sets a new password and signs them in", async ({ page, browser }) => {
  const email = "yusuf.karim@brandshift.test";

  await sendReset(page, "Yusuf Karim");
  const link = await linkFromOutbox(page, email);

  const context = await browser.newContext(anonymous);
  const resetting = await context.newPage();
  await resetting.goto(link);
  await expect(resetting.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  await resetting.getByLabel("Password", { exact: true }).fill("brand-new-password-here");
  await resetting.getByLabel("Confirm password").fill("brand-new-password-here");
  await resetting.getByRole("button", { name: /Set password/ }).click();
  await expect(resetting).toHaveURL(/\/en\/today$/);

  // And the old one is gone: `passwordChangedAt` moves, so every session
  // issued before now is refused too.
  const old = await browser.newContext(anonymous);
  const oldPage = await old.newPage();
  await oldPage.goto("/en/login");
  await oldPage.getByLabel("Email").fill(email);
  await oldPage.getByLabel("Password", { exact: true }).fill("brandshift");
  await oldPage.getByRole("button", { name: "Sign in" }).click();
  await expect(oldPage).not.toHaveURL(/\/today$/);

  await context.close();
  await old.close();
});

test("a reset link cannot be spent as an invitation", async ({ page, browser }) => {
  const email = "nadia.haddad@brandshift.test";

  await sendReset(page, "Nadia Haddad");
  const link = await linkFromOutbox(page, email);
  const token = link.match(/\/reset\/([A-Za-z0-9_-]+)$/)?.[1];
  expect(token).toBeTruthy();

  const context = await browser.newContext(anonymous);
  const spender = await context.newPage();

  // The purpose is checked against the token, not taken from the URL.
  await spender.goto(`/en/accept/${token}`);
  await expect(spender.getByRole("heading", { name: "That link is not valid" })).toBeVisible();

  await context.close();
});

test("an admin is offered nothing at all on an owner's page", async ({ page }) => {
  // The sharpest of the owner guards: the reset link is written to the outbox
  // every admin can read, so an admin who could send one for an owner could
  // set themselves a password for the most privileged account in the
  // organization -- straight around the fence on changing an owner's email.
  // `sendPasswordReset` refuses it, and the control is not drawn either, so
  // the two cannot disagree.
  await openPerson(page, "Amina Benali");

  await expect(resetCard(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);

  // The rest of the admin panel stands down on an owner for the same reason.
  for (const heading of [
    "Change role and access",
    "Edit details",
    "Change sign-in email",
    "Suspend access",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toHaveCount(0);
  }
});
