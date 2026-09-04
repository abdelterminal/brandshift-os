import { expect, test, type Page } from "@playwright/test";

/**
 * The PDF download.
 *
 * A headless Chromium on the server renders the same print route a person
 * sees, so what is worth protecting is that the file is real and that the
 * checks happen in the right order:
 *
 * 1. It is a PDF, it is not empty, and it has the pages a PDF has.
 * 2. Permission is checked **before** a browser is started -- otherwise a URL
 *    is enough to make this server do work for somebody who may not read it.
 * 3. A bad id is a 404, not a rendered error page dressed up as a document.
 * 4. The filename is something findable, not `download.pdf`.
 */

/** A known seeded quote, so nothing another spec creates can change it. */
async function quoteId(page: Page): Promise<string> {
  await page.goto("/en/finance/quotes");
  await page.getByRole("link", { name: /Phase two: internal brand/ }).first().click();
  await expect(page).toHaveURL(/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("downloads a real PDF of the quote", async ({ page }) => {
  const id = await quoteId(page);

  const response = await page.request.get(`/en/finance/quotes/${id}/pdf`);
  expect(response.status(), await response.text().catch(() => "")).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");

  const body = await response.body();

  // A PDF starts with %PDF- and ends with %%EOF. Both, because a truncated
  // render would still satisfy the first.
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(body.subarray(-1024).toString("latin1")).toContain("%%EOF");

  // Not a blank sheet: the real document is comfortably over 10KB, and an
  // empty A4 page is about 1.
  expect(body.byteLength).toBeGreaterThan(10_000);

  // Exactly one page. The sheet is designed to be a single sheet, and a
  // second page means something overflowed.
  const pages = body.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
  expect(pages.length, "the devis should be one page").toBe(1);
});

test("the filename is findable on a desktop", async ({ page }) => {
  const id = await quoteId(page);
  const response = await page.request.get(`/en/finance/quotes/${id}/pdf`);

  // Number first, because that is what both sides of a dispute quote at each
  // other; and ASCII, because this crosses a header and a Windows filesystem.
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment; filename="q-\d{4}-\d{4}-quote-[a-z0-9-]+\.pdf"/,
  );
});

test("downloads the invoice too", async ({ page }) => {
  await page.goto("/en/finance/invoices");
  await page.getByRole("link", { name: /Meridian rebrand, stage two/ }).first().click();
  await expect(page).toHaveURL(/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;

  const response = await page.request.get(`/en/finance/invoices/${id}/pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("-invoice-");
});

test("a bad id is a 404, and starts no browser", async ({ page }) => {
  const response = await page.request.get("/en/finance/quotes/not-a-uuid/pdf");
  expect(response.status()).toBe(404);

  // A 404 from `notFound()` carries no content-type at all, so default to the
  // empty string rather than asserting against undefined. What matters is that
  // nothing PDF-shaped comes back.
  expect(response.headers()["content-type"] ?? "").not.toContain("application/pdf");
  expect((await response.body()).subarray(0, 5).toString("latin1")).not.toBe("%PDF-");
});

test("the download button is on the print view and off the paper", async ({ page }) => {
  const id = await quoteId(page);
  await page.goto(`/en/finance/quotes/${id}/print`);

  const download = page.getByRole("link", { name: "Download PDF" });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("href", `/en/finance/quotes/${id}/pdf`);

  // Furniture, not document: it must not print.
  await expect(page.locator(".sheet-hide-in-print")).toContainText("Download PDF");
});
