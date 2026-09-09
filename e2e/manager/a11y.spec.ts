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

test("the task board is clean, both editable and read-only", async ({ page }) => {
  // NOR: Elena is its lead, so this is the interactive board -- dnd-kit's
  // context, the drag handles, the four chevrons per card.
  await page.goto("/en/work/NOR");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();
  await expectNoAxeViolations(page, "/en/work/NOR -- Board view (editable)");

  // MER: she is not on its team, so this is the same static board every
  // other project's board used to be, for everyone, before this feature.
  await page.goto("/en/work/MER");
  await page.getByRole("tab", { name: "Tasks" }).click();
  await page.getByRole("radio", { name: "Board" }).click();
  await expectNoAxeViolations(page, "/en/work/MER -- Board view (read-only)");
});

test("a channel you have not joined is clean, waiting or not -- and so is the approval panel", async ({
  page,
}) => {
  const ATLAS = "/en/channels/atlas-design-system";

  // Elena is not on Atlas's team (see channels.spec.ts's own note on this).
  await page.goto(ATLAS);
  await expectNoAxeViolations(page, `${ATLAS} -- not a member`);

  await page.getByRole("button", { name: "Request to join" }).click();
  await expect(page.getByRole("button", { name: "Requested" })).toBeVisible();
  await expectNoAxeViolations(page, `${ATLAS} -- request pending`);

  // Tom (finance) is an admin, so this is also the pending-requests panel's
  // own sweep -- and undoing the request as him leaves Atlas exactly as this
  // test found it.
  const financeContext = await page.context().browser()!.newContext({
    storageState: "e2e/.auth/finance.json",
  });
  const financePage = await financeContext.newPage();
  await financePage.goto(ATLAS);
  await expectNoAxeViolations(financePage, `${ATLAS} -- pending requests panel`);
  await financePage.getByRole("button", { name: "Decline" }).click();
  await expect(financePage.getByText("Elena Rossi")).toHaveCount(0);
  await financeContext.close();
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
