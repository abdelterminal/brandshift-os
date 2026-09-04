import { expect, test, type Page } from "@playwright/test";

/**
 * Password reset.
 *
 * The last piece of a chain whose other parts were built with invitations: the
 * token, the transport, and the screen that spends one. This is the form that
 * mints one, and it is the only unauthenticated action in the app that writes
 * anything -- which is what most of these tests are about.
 *
 * In the `finance` project because reading the outbox needs an admin; the
 * public half of each test uses an explicitly anonymous context.
 */

const main = (page: Page) => page.locator("#main");

/** No session at all -- `browser.newContext()` alone inherits the project's. */
const anonymous = { storageState: { cookies: [], origins: [] } };

test("the form is reachable without a session", async ({ browser }) => {
  const context = await browser.newContext(anonymous);
  const page = await context.newPage();

  // It was not, at first: `/forgot` was missing from the public paths, so the
  // one screen for people who cannot sign in redirected them to sign in.
  await page.goto("/en/login");
  await page.getByRole("link", { name: /Forgotten/ }).click();

  await expect(page).toHaveURL(/\/en\/forgot$/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

  await context.close();
});

test("says the same thing whether or not the address exists", async ({ browser }) => {
  const real = await browser.newContext(anonymous);
  const stranger = await browser.newContext(anonymous);

  const known = await real.newPage();
  await known.goto("/en/forgot");
  await known.getByLabel("Email").fill("lukas.weber@brandshift.test");
  await known.getByRole("button", { name: "Send the link" }).click();
  const first = await known.getByRole("status").innerText();

  const unknown = await stranger.newPage();
  await unknown.goto("/en/forgot");
  await unknown.getByLabel("Email").fill("nobody-at-all@example.com");
  await unknown.getByRole("button", { name: "Send the link" }).click();
  const second = await unknown.getByRole("status").innerText();

  // Word for word. A reset form that says "no such account" hands back
  // everything sign-in refuses to give.
  expect(first).toBe(second);

  await real.close();
  await stranger.close();
});

test("a stranger's request writes nothing at all", async ({ page, browser }) => {
  const context = await browser.newContext(anonymous);
  const stranger = await context.newPage();

  await stranger.goto("/en/forgot");
  await stranger.getByLabel("Email").fill("definitely-nobody@example.com");
  await stranger.getByRole("button", { name: "Send the link" }).click();
  await expect(stranger.getByRole("status")).toBeVisible();
  await context.close();

  // Not even a queued row: otherwise the outbox itself becomes the way to find
  // out which addresses are real.
  await page.goto("/en/settings");
  await expect(main(page).getByText("definitely-nobody@example.com")).toHaveCount(0);
});

test("the link sets a new password and signs them in", async ({ page, browser }) => {
  const email = "yusuf.karim@brandshift.test";

  const asking = await browser.newContext(anonymous);
  const asker = await asking.newPage();
  await asker.goto("/en/forgot");
  await asker.getByLabel("Email").fill(email);
  await asker.getByRole("button", { name: "Send the link" }).click();
  await expect(asker.getByRole("status")).toBeVisible();
  await asking.close();

  // Read the link out of the outbox, exactly as an admin on a LAN would.
  await page.goto("/en/settings");
  const row = main(page).locator("li", { hasText: email }).first();
  await row.getByRole("button", { name: "Show message" }).click();
  // The body renders on a state change, so reading the row straight after the
  // click can beat React to it.
  await expect(row.locator("pre")).toBeVisible();

  const match = (await row.innerText()).match(/https?:\/\/[^\s]+\/en\/reset\/[A-Za-z0-9_-]+/);
  expect(match, "the reset body should carry a link").not.toBeNull();
  const link = match![0].replace(/:\d+/, `:${new URL(page.url()).port}`);

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

test("asking twice in a row does not queue a second message", async ({ page, browser }) => {
  const email = "claire.moreau@brandshift.test";

  const context = await browser.newContext(anonymous);
  const asker = await context.newPage();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await asker.goto("/en/forgot");
    await asker.getByLabel("Email").fill(email);
    await asker.getByRole("button", { name: "Send the link" }).click();
    await expect(asker.getByRole("status")).toBeVisible();
  }
  await context.close();

  // One live token per person, so nobody can fill an inbox by holding down a
  // button. There is still no rate limiting -- the standing gap -- and this is
  // what stops the obvious abuse in the meantime.
  await page.goto("/en/settings");
  await expect(main(page).locator("li", { hasText: email })).toHaveCount(1);
});

test("a reset link cannot be spent as an invitation", async ({ page, browser }) => {
  const email = "nadia.haddad@brandshift.test";

  const context = await browser.newContext(anonymous);
  const asker = await context.newPage();
  await asker.goto("/en/forgot");
  await asker.getByLabel("Email").fill(email);
  await asker.getByRole("button", { name: "Send the link" }).click();
  await expect(asker.getByRole("status")).toBeVisible();

  await page.goto("/en/settings");
  const row = main(page).locator("li", { hasText: email }).first();
  await row.getByRole("button", { name: "Show message" }).click();
  // The body renders on a state change, so reading the row straight after the
  // click can beat React to it.
  await expect(row.locator("pre")).toBeVisible();
  // Either locale: the message is written in the *recipient's* language, and
  // this one is seeded as `fr`. Looking only for `/en/` failed here, which was
  // the locale feature working rather than a bug.
  const token = (await row.innerText()).match(/\/(?:en|fr)\/reset\/([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();

  // The purpose is checked against the token, not taken from the URL.
  await asker.goto(`/en/accept/${token}`);
  await expect(asker.getByRole("heading", { name: "That link is not valid" })).toBeVisible();

  await context.close();
});
