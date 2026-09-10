import { expect, test, type Page } from "@playwright/test";

/**
 * The whole app updates in real time.
 *
 * One SSE connection in the shell (`/api/stream`) means a change anyone makes
 * lands on everyone else's open page without a refresh -- the same mechanism
 * channels already used, now generalised to every tenant write via
 * `withOrg()`. This proves the end-to-end path: a write in one browser, a
 * `pg_notify`, the stream, and `router.refresh()` in another browser, with no
 * `reload()` anywhere in the observer's timeline.
 */

const main = (page: Page) => page.locator("#main");

// HAR is the planning project: everything on it is seeded to-do, so this title
// is safe to complete and the assertion does not depend on dates or ordering.
// Chosen from the tail of HAR's list, away from the `.first()` row that other
// specs mutate.
const TITLE = "Estimate the engineering work";

test("a change made in one window appears in another without a refresh", async ({ browser }) => {
  const managerCtx = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const memberCtx = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const manager = await managerCtx.newPage();
  const member = await memberCtx.newPage();

  try {
    // The member is watching the project's task list and nothing else.
    await member.goto("/en/work/HAR");
    await member.getByRole("tab", { name: "Tasks" }).click();
    await expect(main(member).getByText(TITLE, { exact: true })).toBeVisible();

    const memberCompleted = member.locator("section", { hasText: "Completed" });
    await expect(memberCompleted.getByText(TITLE, { exact: true })).toHaveCount(0);

    // The manager completes it from a separate browser context.
    await manager.goto("/en/work/HAR");
    await manager.getByRole("tab", { name: "Tasks" }).click();
    await main(manager).getByText(TITLE, { exact: true }).click();
    const drawer = manager.getByRole("dialog");
    await drawer.getByRole("button", { name: "Mark complete" }).click();
    await expect(drawer).toBeHidden();

    // The member's page catches up on its own. No member.reload() has run.
    await expect(memberCompleted.getByText(TITLE, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await managerCtx.close();
    await memberCtx.close();
  }
});
