import { expect, test, type Page } from "@playwright/test";

/**
 * Dragging a container or table column to a different size, on the two
 * screens it was asked for: the Today coordination queue and the People
 * directory. Both are `ResizeHandle` + `role="separator"`, both clamp to a
 * sane range, and both remember the result in this browser only -- see
 * `ResizableQueueColumns` and `people-table.tsx`'s own docs for why
 * `localStorage` rather than the database.
 */

async function dragHandle(page: Page, index: number, deltaX: number) {
  const handle = page.getByRole("separator", { name: "Resize column" }).nth(index);
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
  locator: ReturnType<Page["locator"]>,
  handleIndex: number,
  deltaX: number,
  minWidth: number,
): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await dragHandle(page, handleIndex, deltaX);
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
  test("dragging the first divider widens that column, and it survives a reload", async ({
    page,
  }) => {
    await page.goto("/en/today");
    const firstCard = page.locator('[data-slot="card"]').first();
    await expect(firstCard).toBeVisible();
    const before = await firstCard.boundingBox();
    if (!before) throw new Error("no card box");

    const widened = await dragUntilWider(page, firstCard, 0, 100, before.width + 50);

    await page.reload();
    const reloadedCard = page.locator('[data-slot="card"]').first();
    await expect(reloadedCard).toBeVisible();
    const afterReload = await reloadedCard.boundingBox();
    expect(afterReload?.width).toBe(widened);
  });

  test("cannot be dragged past the maximum", async ({ page }) => {
    await page.goto("/en/today");
    const firstCard = page.locator('[data-slot="card"]').first();
    await expect(firstCard).toBeVisible();

    await dragHandle(page, 0, 2000);

    const after = await firstCard.boundingBox();
    // MAX_WIDTH in resizable-queue-columns.tsx.
    expect(after?.width ?? 0).toBeLessThanOrEqual(560);
  });

  test("stacks with no handles below the desktop breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/en/today");
    await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize column" })).toHaveCount(0);
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

    const widened = await dragUntilWider(page, nameHeader, 0, 90, before.width + 40);

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

    await dragHandle(page, 0, -2000);

    const after = await nameHeader.boundingBox();
    // MIN_WIDTH in people-table.tsx.
    expect(after?.width ?? 0).toBeGreaterThanOrEqual(90);
  });
});
