import { expect, test, type Page } from "@playwright/test";

/**
 * Time off.
 *
 * What is worth protecting, in the order it would break:
 *
 * 1. Weekends do not cost anything, and the number on the form is the number
 *    that leaves the balance. A balance wrong by half a day is one nobody
 *    trusts again.
 * 2. Nobody signs off their own request, whatever their role.
 * 3. Approved leave reaches the calendar; a pending request does not.
 * 4. A refusal carries a reason, and a withdrawal gives the days back.
 */

const main = (page: Page) => page.locator("#main");

/**
 * The first weekday at or after `offset` days from today.
 *
 * The seed nudges every leave start onto a weekday, because a request falling
 * on a Saturday costs nothing and the app would refuse it. A test aiming at
 * seeded leave has to do the same arithmetic or it looks at the wrong day.
 */
async function firstWeekdayFrom(page: Page, offset: number): Promise<string> {
  return page.evaluate((days) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const at = new Date(`${today}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + days);
    while (at.getUTCDay() === 0 || at.getUTCDay() === 6) {
      at.setUTCDate(at.getUTCDate() + 1);
    }
    return at.toISOString().slice(0, 10);
  }, offset);
}

/** The next Monday, so a range is never accidentally all weekend. */
async function nextMonday(page: Page, weeksAhead = 1): Promise<string> {
  return page.evaluate((weeks) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const at = new Date(`${today}T00:00:00Z`);
    const ahead = (8 - at.getUTCDay()) % 7 || 7;
    at.setUTCDate(at.getUTCDate() + ahead + (weeks - 1) * 7);
    return at.toISOString().slice(0, 10);
  }, weeksAhead);
}

test("counts working days, and refuses a range that is all weekend", async ({ page }) => {
  await page.goto("/en/leave");
  await expect(main(page).getByRole("heading", { name: "Time off", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Ask for time off" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask for time off" });

  // Monday to Friday is five; the weekend on either side adds nothing.
  const monday = await nextMonday(page, 6);
  const friday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 4);
    return at.toISOString().slice(0, 10);
  }, monday);

  await dialog.getByLabel("From", { exact: true }).fill(monday);
  await dialog.getByLabel("To", { exact: true }).fill(friday);
  await expect(dialog.getByText("5 working days")).toBeVisible();

  // Extend across the weekend into the next Monday: six, not eight.
  const nextMon = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 7);
    return at.toISOString().slice(0, 10);
  }, monday);
  await dialog.getByLabel("To", { exact: true }).fill(nextMon);
  await expect(dialog.getByText("6 working days")).toBeVisible();

  // A Saturday to a Sunday costs nothing, and cannot be submitted.
  const saturday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 5);
    return at.toISOString().slice(0, 10);
  }, monday);
  const sunday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 6);
    return at.toISOString().slice(0, 10);
  }, monday);

  await dialog.getByLabel("From", { exact: true }).fill(saturday);
  await dialog.getByLabel("To", { exact: true }).fill(sunday);
  await expect(dialog.getByText(/costs nothing/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send the request" })).toBeDisabled();
});

test("half a day is offered only for a single day, and costs half", async ({ page }) => {
  await page.goto("/en/leave");
  await page.getByRole("button", { name: "Ask for time off" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask for time off" });

  const monday = await nextMonday(page, 7);
  await dialog.getByLabel("From", { exact: true }).fill(monday);
  await dialog.getByLabel("To", { exact: true }).fill(monday);

  await dialog.getByLabel("Half a day only").check();
  await expect(dialog.getByText("0.5 working days")).toBeVisible();

  // Widen the range and the option goes: half of a fortnight is not a thing
  // this form can express, so it does not pretend to.
  const friday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 4);
    return at.toISOString().slice(0, 10);
  }, monday);
  await dialog.getByLabel("To", { exact: true }).fill(friday);
  await expect(dialog.getByLabel("Half a day only")).toHaveCount(0);
  await expect(dialog.getByText("5 working days")).toBeVisible();
});

test("asking twice for the same days is refused", async ({ page }) => {
  await page.goto("/en/leave");

  const monday = await nextMonday(page, 9);
  const wednesday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 2);
    return at.toISOString().slice(0, 10);
  }, monday);

  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "Ask for time off" }).click();
    const dialog = page.getByRole("dialog", { name: "Ask for time off" });
    await dialog.getByLabel("From", { exact: true }).fill(monday);
    await dialog.getByLabel("To", { exact: true }).fill(wednesday);
    await dialog.getByRole("button", { name: "Send the request" }).click();

    if (attempt === 1) {
      await expect(dialog).toBeHidden();
    } else {
      await expect(dialog.getByText(/already have time off/)).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }
  }
});

test("a request reaches somebody who can answer it, and they can", async ({ page, browser }) => {
  // Lukas asks; Elena is a manager, so it lands with her.
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  const monday = await nextMonday(memberPage, 12);
  const tuesday = await memberPage.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 1);
    return at.toISOString().slice(0, 10);
  }, monday);

  await memberPage.goto("/en/leave");
  await memberPage.getByRole("button", { name: "Ask for time off" }).click();
  const dialog = memberPage.getByRole("dialog", { name: "Ask for time off" });
  await dialog.getByLabel("From", { exact: true }).fill(monday);
  await dialog.getByLabel("To", { exact: true }).fill(tuesday);
  await dialog.getByRole("button", { name: "Send the request" }).click();
  await expect(dialog).toBeHidden();

  // He sees it waiting.
  await expect(
    memberPage.locator("#main").getByRole("listitem").filter({ hasText: "Annual leave" }).first(),
  ).toContainText("Waiting");

  // And he is not offered a way to approve it himself.
  await expect(memberPage.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await memberContext.close();

  // She hears about it, and it is in her queue.
  await page.goto("/en/inbox");
  await expect(page.getByText(/asked for time off/).first()).toBeVisible();

  await page.goto("/en/leave");
  const hisRequests = main(page).getByRole("listitem").filter({ hasText: "Lukas Weber" });

  // He has a seeded fortnight pending as well, so the queue does not empty --
  // it gets one shorter. Counting is what makes this independent of whatever
  // else the seed and the earlier tests have left lying around.
  const before = await hisRequests.count();
  expect(before).toBeGreaterThan(0);

  await hisRequests.first().getByRole("button", { name: "Approve" }).click();
  await expect(hisRequests).toHaveCount(before - 1);
});

test("approved leave reaches the calendar; a pending request does not", async ({ page }) => {
  // Marc's approved leave starts on the first weekday at or after three days
  // out, which is where the seed put it.
  const away = await firstWeekdayFrom(page, 3);
  await page.goto(`/en/calendar?who=all&range=week&from=${away}`);

  // Scoped to the rows that are about somebody being away: a name on this
  // screen is just as likely to be a task's assignee.
  const awayRows = main(page).getByRole("listitem").filter({ hasText: "Away" });

  await expect(awayRows.filter({ hasText: "Marc Dubois" }).first()).toBeVisible();

  // Lukas's seeded fortnight is still pending, so nobody is planning round it.
  await expect(awayRows.filter({ hasText: "Lukas Weber" })).toHaveCount(0);
});

test("scheduling a meeting says when somebody is away, not merely busy", async ({ page }) => {
  await page.goto("/en/calendar/new");
  await page.getByRole("textbox", { name: "What is it about" }).fill("Away check");

  const away = await firstWeekdayFrom(page, 3);
  await page.getByLabel("Starts").fill(`${away}T10:00`);
  await page.getByLabel("Marc Dubois").check();

  // "Away" rather than "Busy": somebody in another meeting can be moved, and
  // somebody on holiday cannot.
  await expect(main(page).getByText("Away").first()).toBeVisible({ timeout: 10_000 });
});

test("a refusal carries its reason back to the person who asked", async ({ page, browser }) => {
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();

  const monday = await nextMonday(memberPage, 15);
  await memberPage.goto("/en/leave");
  await memberPage.getByRole("button", { name: "Ask for time off" }).click();
  const dialog = memberPage.getByRole("dialog", { name: "Ask for time off" });
  await dialog.getByLabel("From", { exact: true }).fill(monday);
  await dialog.getByLabel("To", { exact: true }).fill(monday);
  await dialog.getByRole("button", { name: "Send the request" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/en/leave");
  const waiting = main(page).getByRole("listitem").filter({ hasText: "Lukas Weber" }).first();
  await waiting.getByRole("button", { name: "Decline" }).click();

  const declineDialog = page.getByRole("dialog", { name: "Decline this request?" });
  // A no with no reason cannot be sent.
  await expect(declineDialog.getByRole("button", { name: "Decline" })).toBeDisabled();
  await declineDialog
    .getByLabel("Why", { exact: true })
    .fill("That is the Northwind cutover week.");
  await declineDialog.getByRole("button", { name: "Decline" }).click();
  await expect(declineDialog).toBeHidden();

  // He is told, and the reason is on the row rather than only in the message.
  await memberPage.goto("/en/leave");
  const declined = memberPage
    .locator("#main")
    .getByRole("listitem")
    .filter({ hasText: "Northwind cutover week" })
    .first();
  await expect(declined).toContainText("Declined");
  await memberContext.close();
});

test("withdrawing gives the days back", async ({ page }) => {
  await page.goto("/en/leave");

  const remaining = main(page).locator("dl div", { hasText: "Left" });
  // Half days are real, so a balance is not an integer -- stripping every
  // non-digit turns 19.5 into 195.
  const before = (await remaining.textContent())?.match(/[\d.]+/)?.[0] ?? "0";

  const monday = await nextMonday(page, 20);
  const friday = await page.evaluate((start) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + 4);
    return at.toISOString().slice(0, 10);
  }, monday);

  await page.getByRole("button", { name: "Ask for time off" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask for time off" });
  await dialog.getByLabel("From", { exact: true }).fill(monday);
  await dialog.getByLabel("To", { exact: true }).fill(friday);
  await dialog.getByRole("button", { name: "Send the request" }).click();
  await expect(dialog).toBeHidden();

  // Pending costs nothing yet -- only approved days come off the balance.
  await expect(remaining).toContainText(before);

  const row = main(page).getByRole("listitem").filter({ hasText: "Waiting" }).first();
  await row.getByRole("button", { name: "Withdraw" }).click();
  const confirm = page.getByRole("dialog", { name: "Withdraw this request?" });
  // No longer needs disambiguating: the dismiss button says "Cancel".
  await confirm.getByRole("button", { name: "Withdraw" }).click();
  await expect(confirm).toBeHidden();

  // The record of having asked stays.
  await expect(main(page).getByText("Withdrawn").first()).toBeVisible();
  await expect(remaining).toContainText(before);
});

test("the palette reaches Time off, which no rail has room for", async ({ page }) => {
  await page.goto("/en/today");

  const rail = page.getByRole("navigation", { name: "Primary" }).first();
  await expect(rail.getByRole("link", { name: "Time off" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByRole("textbox").fill("time o");
  await palette.getByRole("button", { name: "Time off" }).first().click();

  await expect(page).toHaveURL(/\/en\/leave$/);
});
