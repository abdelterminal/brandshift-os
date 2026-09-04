import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../axe";
import { SALES_ROUTES, VIEWPORTS } from "../routes";

/**
 * The pipeline.
 *
 * Signed in as client services, because that is the only seeded role holding
 * the `crm` module. A fixture whose permissions do not match the job it is
 * named after stops being evidence of anything -- and it gives the suite
 * somebody who can see this and somebody who cannot.
 *
 * What is worth protecting:
 *
 * 1. A list by default, a board behind a toggle, both addressable by URL.
 * 2. Losing a deal asks why, and the reason survives on the deal itself.
 * 3. Money is what somebody typed, not what a float made of it.
 * 4. A deal gets a channel on the same spine a project does.
 */

const main = (page: Page) => page.locator("#main");

test("opens as a list, with the board behind a toggle", async ({ page }) => {
  await page.goto("/en/crm");

  await expect(main(page).getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();

  // Lists before boards, as with tasks.
  await expect(main(page).getByRole("link", { name: "List", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await main(page).getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  await expect(main(page).getByRole("heading", { name: "Negotiation", level: 3 })).toBeVisible();
});

test("hides closed deals until asked", async ({ page }) => {
  await page.goto("/en/crm");

  // Two seeded deals are lost; neither is on the open pipeline.
  await expect(main(page).getByText("Q4 retainer renewal")).toHaveCount(0);

  await main(page).getByRole("link", { name: "Include closed" }).click();
  await expect(page).toHaveURL(/closed=all/);
  await expect(main(page).getByText("Q4 retainer renewal")).toBeVisible();
});

test("losing a deal asks why, and the reason stays on the deal", async ({ page }) => {
  await page.goto("/en/crm");
  await main(page)
    .getByRole("link", { name: /Annual report/ })
    .click();
  await expect(page).toHaveURL(/\/en\/crm\/deals\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Lost", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Why was it lost?" });

  // A pipeline with no reasons on the lost deals teaches nobody anything.
  await expect(dialog.getByRole("button", { name: "Lost", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Went to an incumbent on price.");
  await dialog.getByRole("button", { name: "Lost", exact: true }).click();
  await expect(dialog).toBeHidden();

  // On the deal, where the next person looking will find it -- not only in
  // the activity feed.
  await expect(main(page).getByText("Went to an incumbent on price.")).toBeVisible();
});

test("a figure is stored as typed, thousands separators and all", async ({ page }) => {
  await page.goto("/en/crm");

  await page.getByRole("button", { name: "New deal" }).click();
  const dialog = page.getByRole("dialog", { name: "New deal" });

  const title = `Money check ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "What is it" }).fill(title);
  await dialog.getByLabel("Company", { exact: true }).selectOption({ label: "Kestrel Partners" });
  // Typed the way people actually type it.
  await dialog.getByLabel("Value").fill("12 500");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/en\/crm\/deals\/[0-9a-f-]{36}$/);
  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(main(page).getByText(/12[,\s ]500/)).toBeVisible();
});

test("a figure that is not a figure is refused, not rounded to zero", async ({ page }) => {
  await page.goto("/en/crm");

  await page.getByRole("button", { name: "New deal" }).click();
  const dialog = page.getByRole("dialog", { name: "New deal" });

  await dialog.getByRole("textbox", { name: "What is it" }).fill("Bad money");
  await dialog.getByLabel("Company", { exact: true }).selectOption({ label: "Kestrel Partners" });
  await dialog.getByLabel("Value").fill("about forty thousand");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog.getByText(/does not look like an amount/)).toBeVisible();
});

test("a deal gets a channel on the same spine a project does", async ({ page }) => {
  await page.goto("/en/crm");
  await main(page)
    .getByRole("link", { name: /Packaging refresh/ })
    .click();

  await main(page).getByRole("link", { name: "Channel" }).click();
  await expect(page).toHaveURL(/\/en\/channels\//);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
});

test("a company gathers its deals and its people", async ({ page }) => {
  await page.goto("/en/crm/companies");
  await main(page)
    .getByRole("link", { name: /Verdant Foods/ })
    .click();

  await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("Verdant Foods");
  await expect(main(page).getByText("Packaging refresh, full range")).toBeVisible();
  await expect(main(page).getByText("Juliette Renard")).toBeVisible();

  // Notes are written where the relationship lives.
  await main(page).getByRole("button", { name: "Write a note" }).click();
  await page.getByRole("textbox", { name: "Notes" }).fill("Procurement, not marketing.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(main(page).getByText("Procurement, not marketing.")).toBeVisible();
});

test("a contact can exist without a company", async ({ page }) => {
  await page.goto("/en/crm/contacts");

  // Refusing to store somebody until they come with a company attached is how
  // they end up in one person's phone instead.
  const loose = main(page).getByRole("listitem").filter({ hasText: "Callum Reid" });
  await expect(loose).toBeVisible();
  await expect(loose.getByText("No company")).toBeVisible();
});

test("a manager without the module cannot see any of it", async ({ browser }) => {
  const managerContext = await browser.newContext({ storageState: "e2e/.auth/manager.json" });
  const managerPage = await managerContext.newPage();

  await managerPage.goto("/en/crm");

  // 403, not 401: the session survives. Who a company is talking to and what
  // it is worth is commercial information, and the flag is what gates it.
  await expect(managerPage.getByRole("heading", { name: "Pipeline", level: 1 })).toHaveCount(0);
  await managerPage.goto("/en/today");
  await expect(managerPage.getByRole("heading", { level: 1 })).toBeVisible();

  await managerContext.close();
});

test.describe("accessible, and never scrolling the page sideways", () => {
  for (const route of SALES_ROUTES) {
    test(`axe: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("#main")).toBeVisible();
      await expectNoAxeViolations(page, route);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of SALES_ROUTES) {
        await page.goto(route);
        await expect(page.locator("#main")).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});

test("a deal can be corrected after it was created", async ({ page }) => {
  await page.goto("/en/crm");
  await page.locator("#main a[href*='/crm/deals/']").first().click();
  await expect(page).toHaveURL(/\/en\/crm\/deals\/[0-9a-f-]{36}$/);

  const title = `Corrected ${String(Date.now()).slice(-5)}`;

  // `editDeal` existed from the day CRM shipped with nothing calling it, so a
  // typo in a figure survived until somebody deleted the deal and made another.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Deal", { exact: true }).fill(title);
  await page.getByLabel("Value").fill("41 500");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("#main").getByRole("heading", { name: title })).toBeVisible();
  // Stored as typed, thousands separator and all -- the same rule as creation.
  await expect(page.locator("#main").getByText(/41[  ,.]?500/)).toBeVisible();
});

test("a corrected figure that is not a figure is refused", async ({ page }) => {
  await page.goto("/en/crm");
  await page.locator("#main a[href*='/crm/deals/']").first().click();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Value").fill("about forty thousand");
  await page.getByRole("button", { name: "Save" }).click();

  // Refused rather than rounded to zero, exactly as on creation. Scoped to
  // the form: a lost deal already carries a status message on this page.
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
});
