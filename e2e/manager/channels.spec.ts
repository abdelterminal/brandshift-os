import { expect, test, type Page } from "@playwright/test";

/**
 * Channels.
 *
 * Four things are worth protecting here, and they are the four that would be
 * quietly wrong without a test looking:
 *
 * 1. Talk and activity share one column, in the order they happened. A channel
 *    that shows only chat is a chat app bolted onto a project.
 * 2. Your own message is never unread. A badge that counts what you just typed
 *    is a badge people learn to ignore.
 * 3. Somebody else's message *is* unread, and the number reaches the rail.
 * 4. A message arrives without a refresh, because that is the whole claim the
 *    SSE stream makes.
 *
 * Locators are scoped to `#main` or to the rail throughout. A channel's name
 * appears in both -- that is the point of nesting it under Work -- so an
 * unscoped query matches twice and the failure says nothing about the app.
 */

const NORTHWIND = "/en/channels/northwind-e-commerce-replatform";

const main = (page: Page) => page.locator("#main");
const rail = (page: Page) => page.getByRole("navigation", { name: "Primary" }).first();
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });

/** Say something, and wait until it is on screen. */
async function say(page: Page, body: string) {
  await composer(page).fill(body);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(main(page).getByText(body)).toBeVisible();
}

test("a project channel interleaves what was said with what happened", async ({ page }) => {
  await page.goto(NORTHWIND);

  await expect(
    main(page).getByRole("heading", { name: "Northwind e-commerce replatform", level: 1 }),
  ).toBeVisible();

  // Seeded talk.
  await expect(main(page).getByText("Staging has been down since this morning")).toBeVisible();

  // Seeded activity, from the same project, in the same list. A blocker is
  // never folded away, however much routine churn surrounds it.
  const column = main(page).getByRole("listitem");
  await expect(column.filter({ hasText: "reported a blocker" }).first()).toBeVisible();

  // The routine churn around it is folded, so the conversation stays readable.
  await expect(column.filter({ hasText: /updates on this work/ }).first()).toBeVisible();
  await expect(column.filter({ hasText: "assigned a task" })).toHaveCount(0);

  // And the project it is about is one click away.
  await main(page).getByRole("link", { name: /Go to the NOR project/ }).click();
  await expect(page).toHaveURL(/\/en\/work\/NOR$/);
});

test("sending a message does not mark it unread for you", async ({ page }) => {
  await page.goto(NORTHWIND);
  await say(page, `Checked the exporter, variant pricing is the only gap left. ${Date.now()}`);

  // The rail row for this channel carries no count: you have read your own
  // message by definition, and the read mark moved when you sent it.
  const row = rail(page).getByRole("link", { name: "Northwind e-commerce replatform" });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-slot="count-badge"]')).toHaveCount(0);
});

test("somebody else's message is unread, and clears when you reach the end", async ({
  page,
  browser,
}) => {
  // Elena runs Northwind; Lukas is on it. Start from a clear badge for her.
  await page.goto(NORTHWIND);
  await expect(composer(page)).toBeVisible();
  await page.goto("/en/today");

  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  const body = `Infra replied, staging is back. Verifying the fix now. ${Date.now()}`;
  await memberPage.goto(NORTHWIND);
  await say(memberPage, body);
  await memberContext.close();

  // She has not read it, so the rail says so.
  await page.goto("/en/today");
  const row = rail(page).getByRole("link", { name: "Northwind e-commerce replatform" });
  await expect(row.locator('[data-slot="count-badge"]')).toHaveText("1");

  // Reaching the end is what clears it, and it clears where you are standing:
  // the read action revalidates the layout, so the badge goes without needing
  // a navigation to notice. Asserting it here rather than after a `goto` is
  // also the only way to assert it without racing the read.
  await row.click();
  await expect(main(page).getByText(body)).toBeVisible();
  await expect(row.locator('[data-slot="count-badge"]')).toHaveCount(0);

  // And it stays cleared, rather than the badge being a stale render.
  await page.goto("/en/today");
  await expect(row.locator('[data-slot="count-badge"]')).toHaveCount(0);
});

test("a message from someone else arrives without a reload", async ({ page, browser }) => {
  await page.goto(NORTHWIND);
  await expect(composer(page)).toBeVisible();

  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  const body = `Variant pricing export is done, pushing now. ${Date.now()}`;
  await memberPage.goto(NORTHWIND);
  await say(memberPage, body);

  // The first page was never navigated. If this passes, the notification
  // travelled through Postgres, out of the SSE route and into a refetch.
  await expect(main(page).getByText(body)).toBeVisible({ timeout: 15_000 });

  await memberContext.close();
});

test("your own message can be edited and deleted; someone else's cannot", async ({ page }) => {
  await page.goto("/en/channels/general");

  const body = `Studio closure moved to the following Monday. ${Date.now()}`;
  await say(page, body);

  await main(page)
    .getByRole("listitem")
    .filter({ hasText: body })
    .getByRole("button", { name: "Message actions" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  const corrected = `${body} -- confirmed with facilities.`;
  await page.getByRole("textbox", { name: "Edit message" }).fill(corrected);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(main(page).getByText(corrected)).toBeVisible();
  await expect(main(page).getByText("(edited)")).toBeVisible();

  // Somebody else's message offers no menu at all.
  const theirs = main(page)
    .getByRole("listitem")
    .filter({ hasText: "New starter handbook is ready" });
  await expect(theirs.getByRole("button", { name: "Message actions" })).toHaveCount(0);

  // Deleting keeps the place in the conversation rather than erasing it.
  await main(page)
    .getByRole("listitem")
    .filter({ hasText: corrected })
    .getByRole("button", { name: "Message actions" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(main(page).getByText(corrected)).toHaveCount(0);
  await expect(main(page).getByText("This message was deleted.").last()).toBeVisible();
});

test("a project that predates channels gets one on first visit", async ({ page }) => {
  // `/work/<key>/channel` is the link the project page offers whether or not a
  // channel exists yet; it creates one and forwards to its real home.
  await page.goto("/en/work/MER");
  await main(page).getByRole("link", { name: "Channel", exact: true }).click();

  await expect(page).toHaveURL(/\/en\/channels\/meridian-rebrand$/);
  await expect(
    main(page).getByRole("heading", { name: "Meridian rebrand", level: 1 }),
  ).toBeVisible();
});

test("leaving takes a channel off the rail, and joining puts it back", async ({ page }) => {
  await page.goto("/en/channels/general");

  await expect(rail(page).getByRole("link", { name: "General" })).toBeVisible();

  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("button", { name: "Join" })).toBeVisible();
  await expect(rail(page).getByRole("link", { name: "General" })).toHaveCount(0);

  // Nothing was deleted: the conversation is still there to read.
  await expect(main(page).getByText("New starter handbook is ready")).toBeVisible();

  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("button", { name: "Leave" })).toBeVisible();
  await expect(rail(page).getByRole("link", { name: "General" })).toBeVisible();
});

test("the channel index separates the ones you are in from the rest", async ({ page }) => {
  await page.goto("/en/channels");

  await expect(main(page).getByRole("heading", { name: "Channels", level: 1 })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Your channels", level: 2 })).toBeVisible();

  // Elena runs Northwind and is not on Atlas, so the list splits that way.
  await expect(main(page).getByRole("link", { name: /Northwind/ })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: /Elsewhere/, level: 2 })).toBeVisible();
  await expect(main(page).getByRole("link", { name: /Atlas/ })).toBeVisible();
});
