import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../axe";
import { MANAGER_ROUTES, MEMBER_ROUTES } from "../routes";

/**
 * Every signed-in route, plus the states that only exist after an interaction
 * -- a drawer, a dialog, an open menu. Those are where ARIA usually goes wrong,
 * and a sweep that only ever sees the resting page never looks at them.
 */

for (const route of [...MEMBER_ROUTES, ...MANAGER_ROUTES]) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("#main")).toBeVisible();
    await expectNoAxeViolations(page, route);
  });
}

test("a project page is clean on every tab", async ({ page }) => {
  await page.goto("/en/work/NOR");

  for (const tab of ["Overview", "Tasks", "Team", "Activity"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expectNoAxeViolations(page, `/en/work/NOR -- ${tab} tab`);
  }
});

test("a person page is clean", async ({ page }) => {
  await page.goto("/en/people");
  await page.getByRole("link", { name: "Marc Dubois" }).click();
  await page.waitForURL(/\/en\/people\/[0-9a-f-]{36}/);

  await expectNoAxeViolations(page, "a person page");
});

test("the task drawer is clean", async ({ page }) => {
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "Open task" }).first().click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAxeViolations(page, "the task drawer");
});

test("the command palette is clean", async ({ page }) => {
  await page.goto("/en/today");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAxeViolations(page, "the command palette");
});

test("the account, language and organization menus are clean", async ({ page }) => {
  await page.goto("/en/today");

  for (const name of ["Account", "Language", "Switch organization"]) {
    await page.getByRole("button", { name }).click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Visible is not the same as settled: the popup fades in, and axe
    // sampling it mid-fade reads blended colours -- it reported 4.19:1
    // between two values that are in no token file. Wait for the fade to
    // finish so the measurement is of what people actually look at.
    await expect(menu).toHaveCSS("opacity", "1");

    await expectNoAxeViolations(page, `the ${name} menu`);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
});

test("dark mode is clean too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/en/today");
  await expect(page.locator("#main")).toBeVisible();

  await expectNoAxeViolations(page, "/en/today in dark mode");
});
