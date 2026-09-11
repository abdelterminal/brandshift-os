import { expect, test } from "@playwright/test";

/**
 * The shell: the rail stays put, and the account menu lets go of the page.
 *
 * Two real bugs, one category -- both are about something outliving the
 * moment it should have ended.
 */

test("the rail does not move when a tall page scrolls", async ({ page }) => {
  // The directory is long enough, at the seeded cast's size, to actually need
  // scrolling -- the bug only shows on a page taller than the viewport.
  await page.goto("/en/people");
  const rail = page.getByRole("navigation", { name: "Primary" });

  const before = await rail.boundingBox();
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(100);
  const after = await rail.boundingBox();

  expect(after).toEqual(before);
});

test("choosing Settings from the account menu closes it, with nothing left to unstick", async ({
  page,
}) => {
  await page.goto("/en/today");

  await page.getByRole("button", { name: "Account" }).click();
  // While open, Base UI locks page scroll -- that part is correct and expected.
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe(
    "hidden",
  );

  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL("**/en/settings");

  // The menu item closes the menu on a plain click, so the lock is released
  // the moment the page lands -- no click anywhere on the page required.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.overflow))
    .not.toBe("hidden");

  // `<main>` is always the thing that can scroll, regardless of whether this
  // particular role's Settings has enough sections to need it right now.
  const mainOverflowY = await page.evaluate(
    () => getComputedStyle(document.getElementById("main")!).overflowY,
  );
  expect(mainOverflowY).toBe("auto");
});
