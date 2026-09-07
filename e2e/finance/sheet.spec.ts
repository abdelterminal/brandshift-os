import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../axe";
import { VIEWPORTS } from "../routes";

/**
 * The printed quote and invoice -- the document the client actually receives.
 *
 * These pages follow the Mediast devis, so what is worth protecting is the
 * things that make it *that* document rather than a table on a page:
 *
 * 1. **The letterhead is on it.** A quote with no company name, no contact
 *    line and no total is not a quote, and every one of those comes from a
 *    different place -- the org row, the join, the stored figures.
 * 2. **It is paper, not app.** No rail, no palette, no avatar menu; and it
 *    stays ink-on-white in the dark theme, because it is going to a printer.
 * 3. **A quote is signed and an invoice is paid**, and the two documents say
 *    so differently.
 * 4. It is reachable from the screen it belongs to, and back again.
 */

const sheet = (page: Page) => page.locator("article.sheet");

/**
 * A known seeded quote, opened by name.
 *
 * Deliberately not "the first one in the list": other specs in this suite
 * create quotes, and whichever ran last would decide what this one is looking
 * at. Meridian Bank's is seeded, has two lines and a quantity on each, so it
 * exercises the four-column layout as well.
 */
async function openQuote(page: Page) {
  await page.goto("/en/finance/quotes");
  await page
    .getByRole("link", { name: /Phase two: internal brand/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/finance\/quotes\/[0-9a-f-]{36}$/);
}

test("a quote prints as the document the client receives", async ({ page }) => {
  await openQuote(page);
  const url = page.url();

  await page.getByRole("link", { name: "Print" }).click();
  await expect(page).toHaveURL(url + "/print");

  const paper = sheet(page);
  await expect(paper).toBeVisible();

  // The letterhead, from the organization row.
  await expect(paper.getByText("Agence de Communication & Marketing Digital")).toBeVisible();
  await expect(paper.getByText("contact@mediast.ma")).toBeVisible();

  // What it is, who it is for, and what it costs.
  await expect(paper.getByText("Quote", { exact: true })).toBeVisible();
  await expect(paper.getByText("Prepared for")).toBeVisible();
  await expect(paper.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(paper.getByText("Total", { exact: true })).toBeVisible();

  // A quote is signed for. An invoice is not.
  await expect(paper.getByText("Agreed — client")).toBeVisible();
  await expect(paper.getByText("Name, date & signature")).toBeVisible();
});

test("nothing of the application comes with it", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();

  // The shell lives in `(app)`; this route deliberately sits outside it.
  await expect(page.locator("#main")).toHaveCount(0);
  await expect(page.locator("nav[data-tour]")).toHaveCount(0);
  await expect(page.locator('button[data-tour="palette"]')).toHaveCount(0);
});

test("stays ink on paper in the dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();

  // The sheet re-points the surface tokens at their light values, so the
  // paper is white however the person who opened it has the app set. A dark
  // rectangle here means somebody printed a black page.
  const background = await sheet(page).evaluate((node) => getComputedStyle(node).backgroundColor);
  const [r, g, b] = background.match(/\d+/g)!.map(Number);
  expect(r + g + b, `the sheet should be paper-coloured, got ${background}`).toBeGreaterThan(720);
});

test("an invoice says what is owed, and is not signed", async ({ page }) => {
  // A seeded part-paid invoice, so the rows that only an invoice has -- what
  // has been paid and what is still owed -- are actually on the page.
  await page.goto("/en/finance/invoices");
  await page
    .getByRole("link", { name: /Meridian rebrand, stage two/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Print" }).click();

  const paper = sheet(page);
  await expect(paper.getByText("Invoice", { exact: true })).toBeVisible();
  await expect(paper.getByText("Paid", { exact: true })).toBeVisible();
  await expect(paper.getByText("Still owed")).toBeVisible();

  // Nobody signs an invoice.
  await expect(paper.getByText("Agreed — client")).toHaveCount(0);
});

test("says what each line covers, and what it does not", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();

  const paper = sheet(page);

  // Inclusions and exclusions are two fields on the line, and both reach the
  // paper. A document that prints only what it covers is the one that starts
  // the argument this section exists to prevent.
  await expect(
    paper.getByText("Twelve interviews across the four departments, transcribed"),
  ).toBeVisible();
  await expect(
    paper.getByText("Rollout training for line managers, quoted separately"),
  ).toBeVisible();
});

test("an exclusion is quieter than what is included", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();

  const paper = sheet(page);
  const included = paper.getByText("Messaging framework: positioning, pillars, proof points");
  const excluded = paper.getByText("Rollout training for line managers, quoted separately");

  const colourOf = (locator: ReturnType<typeof paper.getByText>) =>
    locator.evaluate((node) => getComputedStyle(node).color);

  // Different ink, and the exclusion is the lighter of the two -- otherwise
  // "not included" reads with exactly the weight of "included".
  const [a, b] = await Promise.all([colourOf(included), colourOf(excluded)]);
  expect(b, "an exclusion should not be set in the same colour as an inclusion").not.toBe(a);

  const lightness = (colour: string) =>
    colour
      .match(/\d+/g)!
      .slice(0, 3)
      .reduce((sum, part) => sum + Number(part), 0);
  expect(lightness(b)).toBeGreaterThan(lightness(a));
});

test("the total bar is ink, not brand red", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();

  // The largest filled shape on the page. In red it would spend the whole of
  // the <=5% brand allowance on a figure that is not an action.
  const bar = sheet(page).locator(".sheet-total-bar");
  const background = await bar.evaluate((node) => getComputedStyle(node).backgroundColor);
  const [r, g, b] = background.match(/\d+/g)!.map(Number);

  expect(r + g + b, `the totals bar should be ink, got ${background}`).toBeLessThan(150);
  expect(r - b, `the totals bar should not be red, got ${background}`).toBeLessThan(40);
});

test("the way back is a link, not the browser button", async ({ page }) => {
  await openQuote(page);
  const url = page.url();

  await page.getByRole("link", { name: "Print" }).click();
  await page.getByRole("link", { name: "Back" }).click();

  await expect(page).toHaveURL(url);
});

test("is set in the fonts the design asks for", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // The PDF renderer embeds whatever Chromium actually drew with, so a silent
  // fallback here becomes a silent fallback in every quote ever sent. Both
  // faces are self-hosted, which is the only reason a headless browser with no
  // system fonts can render this at all.
  const families = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
  );
  expect(families).toContain("spaceGrotesk");
  expect(families).toContain("inter");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCSS("font-family", /spaceGrotesk/);
});

test("the printed document is accessible", async ({ page }) => {
  await openQuote(page);
  await page.getByRole("link", { name: "Print" }).click();
  await expectNoAxeViolations(page, "quote print view");
});

/*
  A sheet is 210mm wide at every viewport, because a document that reflows on a
  phone is no longer the document that was sent. It therefore scrolls inside
  its own container -- and the thing worth proving is that the *page* does not,
  which is the rule the rest of the app is held to.
*/
for (const viewport of VIEWPORTS) {
  test(`the page does not scroll sideways at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openQuote(page);
    await page.getByRole("link", { name: "Print" }).click();
    await expect(sheet(page)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the print view at ${viewport.width}px`).toBeLessThanOrEqual(1);
  });
}
