import { expect, test } from "@playwright/test";

import { MANAGER_ROUTES, MEMBER_ROUTES, VIEWPORTS } from "../routes";

/**
 * The widths in the definition of done.
 *
 * These were unverified below about 654px for five milestones, because the
 * tooling drove a real Chrome window and Chrome clamps its own minimum width.
 * Playwright sets the viewport directly, so 320px is finally reachable.
 *
 * The assertion is the one that matters: the page body must never scroll
 * sideways. Wide content -- tables, the board, the colour ramps -- is allowed
 * to scroll, but inside its own container.
 */

const ROUTES = [...MEMBER_ROUTES, ...MANAGER_ROUTES];

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);
        // Wait for the shell, so the measurement is of a rendered page.
        await expect(page.locator("#main")).toBeVisible();

        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          return {
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            // Whichever element is actually sticking out, so a failure names
            // the culprit instead of just the page.
            widest: [...document.querySelectorAll("body *")]
              .filter((el) => {
                const style = getComputedStyle(el);
                if (style.overflowX === "auto" || style.overflowX === "scroll") return false;
                return el.getBoundingClientRect().right > root.clientWidth + 1;
              })
              .slice(0, 3)
              .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
          };
        });

        expect(
          overflow.scrollWidth,
          `${route} overflows by ${overflow.scrollWidth - overflow.clientWidth}px. Widest: ${overflow.widest.join(" | ")}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  });
}

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("swaps the rail for the bottom nav, losing no destination", async ({ page }) => {
    await page.goto("/en/today");

    // The desktop rail is hidden; the bottom bar takes over.
    const navs = page.getByRole("navigation", { name: "Primary" });
    await expect(navs.first()).toBeVisible();

    for (const label of ["Today", "Work", "People"]) {
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
    }

    // The fifth destination is behind More rather than dropped.
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Inbox" })).toBeVisible();
  });

  test("keeps a wide table inside its own scroller", async ({ page }) => {
    await page.goto("/en/work");
    await expect(page.locator('[data-slot="table-container"]')).toBeVisible();

    const canScrollItself = await page.evaluate(() => {
      const container = document.querySelector('[data-slot="table-container"]');
      if (!container) return false;
      return getComputedStyle(container).overflowX === "auto";
    });

    expect(canScrollItself).toBe(true);
  });
});
