import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Dragging a container or table column to a different size, on the two
 * screens it was asked for: the Today coordination queue and the People
 * directory. Both are `ResizeHandle` + `role="separator"`, both clamp to a
 * sane range, and both remember the result in this browser only -- see
 * `ResizableQueueColumns` and `people-table.tsx`'s own docs for why
 * `localStorage` rather than the database.
 */

async function dragHandle(page: Page, handle: Locator, deltaX: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("resize handle has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

/**
 * Drag, then confirm the width actually moved -- retrying the whole gesture
 * once if it did not. This suite runs deep into a full run against one
 * shared organization with `LiveSync` switched on: a still-propagating
 * write from an earlier, unrelated test can fire this very page's
 * `router.refresh()` mid-drag and remount the column with its pre-drag
 * width, which is a timing accident between two independently-correct
 * systems, not a defect in either one (see `KNOWN-GAPS.md`'s existing note
 * that a live refresh is not scoped to what is actually on screen).
 */
async function dragUntilWider(
  page: Page,
  locator: Locator,
  handle: Locator,
  deltaX: number,
  minWidth: number,
): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await dragHandle(page, handle, deltaX);
    try {
      await expect
        .poll(async () => (await locator.boundingBox())?.width ?? 0, { timeout: 2000 })
        .toBeGreaterThan(minWidth);
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box after drag");
  return box.width;
}

test.describe("Today's coordination queue columns", () => {
  /**
   * The Blocked column's card.
   *
   * Every column now owns both of its own edges and can be reordered, so there
   * is no "first divider" to grab by position -- a handle is addressed by the
   * column it belongs to and which edge it is. Scoped by heading rather than
   * by `.first()` on the page, too: Today has cards above the queue, and the
   * saved order means the leftmost column is not necessarily this one.
   */
  const blockedColumn = (page: Page) =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: "Blocked" }) });

  /** Dragging the *right* edge right is the gesture that grows a column. */
  const growHandle = (page: Page) =>
    page.getByRole("separator", { name: "Resize Blocked from the right" });

  test("dragging a column's edge widens it, and it survives a reload", async ({ page }) => {
    await page.goto("/en/today");
    const card = blockedColumn(page);
    await expect(card).toBeVisible();
    const before = await card.boundingBox();
    if (!before) throw new Error("no card box");

    const widened = await dragUntilWider(page, card, growHandle(page), 100, before.width + 50);

    await page.reload();
    const reloaded = blockedColumn(page);
    await expect(reloaded).toBeVisible();
    const afterReload = await reloaded.boundingBox();
    expect(afterReload?.width).toBe(widened);
  });

  test("cannot be dragged past the maximum", async ({ page }) => {
    await page.goto("/en/today");
    const card = blockedColumn(page);
    await expect(card).toBeVisible();

    await dragHandle(page, growHandle(page), 2000);

    const after = await card.boundingBox();
    // MAX_WIDTH in resizable-queue-columns.tsx.
    expect(after?.width ?? 0).toBeLessThanOrEqual(560);
  });

  test("stacks with no handles below the desktop breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/en/today");
    await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
    // Matched by prefix rather than by the old fixed "Resize column" name,
    // which no longer exists here -- asserting a count of zero against a name
    // nothing uses passes without testing anything.
    await expect(page.getByRole("separator", { name: /^Resize / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Move column/ })).toHaveCount(0);
  });
});

test.describe("People directory table columns", () => {
  test("dragging the Name column's divider widens it, and it survives a reload", async ({
    page,
  }) => {
    await page.goto("/en/people");
    const nameHeader = page.getByRole("columnheader", { name: "Name" });
    await expect(nameHeader).toBeVisible();
    const before = await nameHeader.boundingBox();
    if (!before) throw new Error("no header box");

    // Every column in this table has one handle, all named alike, so the
    // Name column's is still addressed by position.
    const nameHandle = page.getByRole("separator", { name: "Resize column" }).first();
    const widened = await dragUntilWider(page, nameHeader, nameHandle, 90, before.width + 40);

    await page.reload();
    const reloadedHeader = page.getByRole("columnheader", { name: "Name" });
    await expect(reloadedHeader).toBeVisible();
    const afterReload = await reloadedHeader.boundingBox();
    expect(afterReload?.width).toBe(widened);
  });

  test("cannot be dragged below the minimum", async ({ page }) => {
    await page.goto("/en/people");
    const nameHeader = page.getByRole("columnheader", { name: "Name" });
    await expect(nameHeader).toBeVisible();

    await dragHandle(page, page.getByRole("separator", { name: "Resize column" }).first(), -2000);

    const after = await nameHeader.boundingBox();
    // MIN_WIDTH in people-table.tsx.
    expect(after?.width ?? 0).toBeGreaterThanOrEqual(90);
  });
});
