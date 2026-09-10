import { expect, test, type Page } from "@playwright/test";

/**
 * Handoffs -- one task waiting on another -- and the nudge that chases them.
 *
 * What is worth protecting:
 *
 * 1. The drawer shows both directions of a link: what this task is waiting on,
 *    and what is waiting on it.
 * 2. A link can be added from the drawer, and nudging the upstream assignee
 *    reaches them -- in their inbox, and as a corner toast on a page they
 *    already have open, with no refresh.
 */

const main = (page: Page) => page.locator("#main");

async function openTask(page: Page, key: string, title: string) {
  await page.goto(`/en/work/${key}`);
  await page.getByRole("tab", { name: "Tasks" }).click();
  await main(page).getByText(title, { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("the drawer shows both ends of a seeded handoff", async ({ page }) => {
  // Seeded: "Wireframe the new welcome sequence" waits on "Define the first
  // ten minutes we are actually fixing", both on HAR.
  await openTask(page, "HAR", "Wireframe the new welcome sequence");
  const drawer = page.getByRole("dialog");
  const handoff = drawer.locator("section", { hasText: "Handoff" });

  await expect(handoff.getByText("Waiting on")).toBeVisible();
  await expect(
    handoff.getByText("Define the first ten minutes we are actually fixing"),
  ).toBeVisible();
  await expect(handoff.getByRole("button", { name: "Nudge" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // The other end.
  await main(page).getByText("Define the first ten minutes we are actually fixing", { exact: true }).click();
  const other = page.getByRole("dialog").locator("section", { hasText: "Handoff" });
  await expect(other.getByText("Blocks")).toBeVisible();
  await expect(other.getByText("Wireframe the new welcome sequence")).toBeVisible();
});

test("adding a link and nudging reaches the upstream assignee", async ({ page, browser }) => {
  // A member -- Lukas -- has one context open on Today, doing nothing.
  const lukasCtx = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const lukas = await lukasCtx.newPage();

  try {
    await lukas.goto("/en/today");
    await expect(lukas.getByRole("heading", { name: "Now" })).toBeVisible();

    // The manager links "Order history migration" to "Search relevance tuning"
    // (Lukas's task) on NOR, then nudges.
    await openTask(page, "NOR", "Order history migration");
    const handoff = page.getByRole("dialog").locator("section", { hasText: "Handoff" });
    await handoff.getByRole("button", { name: "Add" }).click();
    await handoff
      .locator("#handoff-pick")
      .selectOption({ label: "Search relevance tuning — Lukas Weber" });

    await expect(handoff.getByText("Search relevance tuning")).toBeVisible();
    await handoff.getByRole("button", { name: "Nudge" }).click();
    await expect(handoff.getByText("Nudged")).toBeVisible();

    // It reaches Lukas as a toast on the page he already had open...
    await expect(lukas.getByText(/is waiting on Search relevance tuning/)).toBeVisible({
      timeout: 15_000,
    });

    // ...and it is in his inbox.
    await lukas.goto("/en/inbox");
    await expect(
      lukas.getByText(/is waiting on Search relevance tuning to get on with Order history migration/),
    ).toBeVisible();
  } finally {
    await lukasCtx.close();
  }
});
