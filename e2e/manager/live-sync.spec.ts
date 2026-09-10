import { expect, test, type Page } from "@playwright/test";

/**
 * The whole app updates in real time.
 *
 * One SSE connection in the shell (`/api/stream`) means a change anyone makes
 * lands on everyone else's open page without a refresh -- the same mechanism
 * channels already used, now generalised to every tenant write via
 * `withOrg()`. This proves the end-to-end path: a write in one browser
 * context, a `pg_notify`, the stream, and `router.refresh()` in another, with
 * no `reload()` anywhere in the observer's timeline.
 *
 * Two contexts off the same manager fixture: same person, two tabs -- each
 * holds its own SSE connection and its own server-side subscription, so this
 * still exercises cross-connection fan-out. A manager sees the whole project,
 * which keeps the assertion independent of the member silo.
 */

const main = (page: Page) => page.locator("#main");

// HAR is the planning project: everything on it is seeded to-do, so this title
// is safe to complete and the assertion does not depend on dates or ordering.
const TITLE = "Estimate the engineering work";

test("a change made in one context appears in another without a refresh", async ({ browser }) => {
  const watcherCtx = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const actorCtx = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const watcher = await watcherCtx.newPage();
  const actor = await actorCtx.newPage();

  try {
    await watcher.goto("/en/work/HAR");
    await watcher.getByRole("tab", { name: "Tasks" }).click();
    await expect(main(watcher).getByText(TITLE, { exact: true })).toBeVisible();

    const watcherCompleted = watcher.locator("section", { hasText: "Completed" });
    await expect(watcherCompleted.getByText(TITLE, { exact: true })).toHaveCount(0);

    // The other context completes it.
    await actor.goto("/en/work/HAR");
    await actor.getByRole("tab", { name: "Tasks" }).click();
    await main(actor).getByText(TITLE, { exact: true }).click();
    const drawer = actor.getByRole("dialog");
    await drawer.getByRole("button", { name: "Mark complete" }).click();
    await expect(drawer).toBeHidden();

    // The watcher's page catches up on its own. No watcher.reload() has run.
    await expect(watcherCompleted.getByText(TITLE, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await watcherCtx.close();
    await actorCtx.close();
  }
});
