import { expect, test, type Page } from "@playwright/test";

/**
 * The calendar and meetings.
 *
 * What is worth protecting, in the order it would break:
 *
 * 1. The calendar shows real rows -- meetings, task deadlines, project
 *    deadlines -- rather than a copy of them that drifts.
 * 2. Every choice is in the URL, so a calendar can be sent to somebody.
 * 3. A clash is shown while you are still choosing, not after the invitation
 *    has gone out.
 * 4. Only whoever called a meeting can move or cancel it, and moving it
 *    withdraws everyone's answer.
 *
 * Locators are scoped to `#main`: a meeting title appears in the agenda and in
 * the panel on Today, and an unscoped query would match twice.
 */

const main = (page: Page) => page.locator("#main");

test("shows meetings and deadlines together, and links to each", async ({ page }) => {
  await page.goto("/en/calendar?range=month&who=all");

  await expect(main(page).getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();

  // A seeded meeting.
  await expect(main(page).getByText("Northwind launch readiness")).toBeVisible();

  // And a deadline, read off the task rather than copied onto the calendar.
  await expect(main(page).getByText("Task due").first()).toBeVisible();

  await main(page).getByText("Northwind launch readiness").click();
  await expect(page).toHaveURL(/\/en\/calendar\/[0-9a-f-]{36}$/);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(
    "Northwind launch readiness",
  );
});

test("a breadcrumb never shows a raw id", async ({ page }) => {
  await page.goto("/en/calendar?range=month&who=all");
  await main(page).getByText("Northwind launch readiness").click();

  const trail = page.getByRole("navigation", { name: /breadcrumb/i }).first();
  await expect(trail).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}/);
  await expect(trail.getByText("Calendar")).toBeVisible();
});

test("every choice is in the URL, so the view can be sent to someone", async ({ page }) => {
  await page.goto("/en/calendar");

  // Defaults: this week, mine, as an agenda.
  await main(page).getByRole("link", { name: "Month", exact: true }).first().click();
  await expect(page).toHaveURL(/range=month/);

  await main(page).getByRole("link", { name: "Everyone" }).click();
  await expect(page).toHaveURL(/who=all/);
  await expect(page).toHaveURL(/range=month/);

  // A fresh browser landing on that URL sees the same thing.
  const url = page.url();
  await page.goto("/en/today");
  await page.goto(url);
  await expect(page.getByRole("link", { name: "Everyone" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("the month grid scrolls inside its own box rather than the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/en/calendar?view=month&range=month&who=all");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("scheduling shows who is already booked, before the invitation goes out", async ({ page }) => {
  await page.goto("/en/calendar");
  await main(page).getByRole("link", { name: "Schedule a meeting" }).click();
  await expect(page).toHaveURL(/\/en\/calendar\/new$/);

  await page.getByRole("textbox", { name: "What is it about" }).fill("Conflict check");

  // Exactly over the seeded Northwind readiness meeting, which Lukas is at.
  const starts = page.getByLabel("Starts");
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await starts.fill(`${today}T10:00`);

  await page.getByLabel("Lukas Weber").check();
  await expect(main(page).getByText(/Busy: Northwind launch readiness/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(main(page).getByText(/already booked/)).toBeVisible();

  // Somebody with nothing on gets no warning.
  await page.getByLabel("Lukas Weber").uncheck();
  await expect(main(page).getByText(/Busy:/)).toHaveCount(0);
});

test("a scheduled meeting reaches its attendees and lands on the calendar", async ({
  page,
  browser,
}) => {
  await page.goto("/en/calendar/new");

  const title = `Hypercare handover ${Date.now()}`;
  await page.getByRole("textbox", { name: "What is it about" }).fill(title);
  await page.getByRole("textbox", { name: "Where" }).fill("Studio room 3");
  await page.getByLabel("Lukas Weber").check();
  await page.getByRole("button", { name: "Schedule it" }).click();

  // It opens on the meeting it just created.
  await expect(page).toHaveURL(/\/en\/calendar\/[0-9a-f-]{36}$/);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(main(page).getByText("Studio room 3")).toBeVisible();

  // The organizer is going without being asked; Lukas has not replied.
  const attendees = main(page).getByRole("listitem");
  await expect(attendees.filter({ hasText: "Elena Rossi" })).toContainText("Going");
  await expect(attendees.filter({ hasText: "Lukas Weber" })).toContainText("No reply yet");

  // And Lukas hears about it, because a meeting moves his day.
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();
  await memberPage.goto("/en/inbox");
  await expect(memberPage.getByText(new RegExp(`invited you to ${title}`))).toBeVisible();
  await memberContext.close();
});

test("answering an invitation records it for everyone to see", async ({ page, browser }) => {
  await page.goto("/en/calendar/new");

  const title = `Response check ${Date.now()}`;
  await page.getByRole("textbox", { name: "What is it about" }).fill(title);
  await page.getByLabel("Lukas Weber").check();
  await page.getByRole("button", { name: "Schedule it" }).click();
  await expect(page).toHaveURL(/\/en\/calendar\/[0-9a-f-]{36}$/);
  const meetingUrl = page.url();

  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(meetingUrl);

  await memberPage.getByRole("button", { name: "Maybe" }).click();
  await expect(
    memberPage.locator("#main").getByRole("listitem").filter({ hasText: "Lukas Weber" }),
  ).toContainText("Maybe");
  await memberContext.close();

  // The organizer sees the answer without asking for it.
  await page.reload();
  await expect(main(page).getByRole("listitem").filter({ hasText: "Lukas Weber" })).toContainText(
    "Maybe",
  );
});

test("only the person who called a meeting can move or cancel it", async ({ page, browser }) => {
  await page.goto("/en/calendar/new");

  const title = `Ownership check ${Date.now()}`;
  await page.getByRole("textbox", { name: "What is it about" }).fill(title);
  await page.getByLabel("Lukas Weber").check();
  await page.getByRole("button", { name: "Schedule it" }).click();
  // Read the URL only once the redirect has landed: taken any earlier it is
  // still /calendar/new, and the second browser opens the form instead.
  await expect(page).toHaveURL(/\/en\/calendar\/[0-9a-f-]{36}$/);
  const meetingUrl = page.url();

  // She called it, so she gets the controls.
  await expect(page.getByRole("button", { name: "Move it" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Call it off" })).toBeVisible();

  // He did not, so he does not -- and he can still read the whole thing.
  const memberContext = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(meetingUrl);
  await expect(memberPage.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(memberPage.getByRole("button", { name: "Move it" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Call it off" })).toHaveCount(0);

  // He answers yes, so there is an answer for the reschedule to withdraw.
  // Exact, because "Not going" also contains "Going".
  await memberPage.getByRole("button", { name: "Going", exact: true }).click();
  await expect(
    memberPage.locator("#main").getByRole("listitem").filter({ hasText: "Lukas Weber" }),
  ).toContainText("Going");
  await memberContext.close();

  // Moving it puts every answer back to "no reply yet": a yes was a yes to a
  // time, and carrying it over puts people in a meeting they never agreed to.
  await page.getByRole("button", { name: "Move it" }).click();
  const dialog = page.getByRole("dialog");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel("Starts").fill(`${tomorrow}T15:00`);
  await dialog.getByRole("button", { name: "Move it" }).click();
  await expect(dialog).toBeHidden();

  await expect(main(page).getByRole("listitem").filter({ hasText: "Lukas Weber" })).toContainText(
    "No reply yet",
  );
});

test("a cancelled meeting says so instead of vanishing", async ({ page }) => {
  await page.goto("/en/calendar/new");

  const title = `Cancellation check ${Date.now()}`;
  await page.getByRole("textbox", { name: "What is it about" }).fill(title);
  await page.getByRole("button", { name: "Schedule it" }).click();

  await page.getByRole("button", { name: "Call it off" }).click();
  // Named, because a toast is also a `role="dialog"` and the confirmation
  // fires one on its way out.
  const dialog = page.getByRole("dialog", { name: "Call off this meeting?" });
  await dialog.getByRole("button", { name: "Call it off" }).click();
  await expect(dialog).toBeHidden();

  // It is still there, and it says what happened -- in words, not a strike
  // through alone. People blocked an hour out for this.
  await expect(main(page).getByText("Called off").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Move it" })).toHaveCount(0);
});

test("notes can be written by anyone who was there", async ({ page }) => {
  // Four days back, which a month view only covers when today is late enough
  // in the month. The calendar takes the day it should open on, so ask for it.
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/en/calendar?range=week&who=all&from=${fourDaysAgo}`);
  await main(page).getByText("Meridian identity sign-off").click();

  // A past meeting already has its write-up, which is the reason to keep it.
  await expect(main(page).getByText(/Wordmark approved as drawn/)).toBeVisible();

  await page.goto("/en/calendar/new");
  const title = `Notes check ${Date.now()}`;
  await page.getByRole("textbox", { name: "What is it about" }).fill(title);
  await page.getByRole("button", { name: "Schedule it" }).click();

  await expect(main(page).getByText("Nothing written yet.")).toBeVisible();
  await page.getByRole("button", { name: "Write it up" }).click();
  await page.getByRole("textbox", { name: "What was decided" }).fill("Agreed to ship on Friday.");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(main(page).getByText("Agreed to ship on Friday.")).toBeVisible();
});

test("Today shows what is next in the diary", async ({ page }) => {
  await page.goto("/en/today");

  // Not asserted on a named meeting: this panel shows what is still ahead, and
  // a seeded meeting at 10:00 stops being ahead at 10:45. What matters is that
  // the panel is there, lists something real, and opens it.
  const panel = main(page).locator("section", {
    has: page.getByRole("heading", { name: "Next up" }),
  });
  await expect(panel).toBeVisible();

  const first = panel.getByRole("listitem").first().getByRole("link");
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/en\/calendar\/[0-9a-f-]{36}$/);

  await page.goto("/en/today");
  await main(page).getByRole("link", { name: "Open the calendar" }).click();
  await expect(page).toHaveURL(/\/en\/calendar$/);
});

test("the palette can reach a screen the rail has no room for", async ({ page }) => {
  await page.goto("/en/today");

  // A manager's rail is Today / Work / People / Insights / Inbox -- five, the
  // cap -- so Calendar is not on it. It still has to be findable.
  const rail = page.getByRole("navigation", { name: "Primary" }).first();
  await expect(rail.getByRole("link", { name: "Calendar" })).toHaveCount(0);

  // The palette is a plain input and a list of buttons, deliberately -- the
  // results are grouped and heterogeneous, and the dialog owns focus.
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByRole("textbox").fill("calen");
  await palette.getByRole("button", { name: "Calendar" }).first().click();

  await expect(page).toHaveURL(/\/en\/calendar$/);
});
