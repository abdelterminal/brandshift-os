import { expect, test } from "@playwright/test";

/**
 * Both locales ship complete, so switching is a navigation to the same page in
 * the other language -- not a setting that changes what a shared link means.
 */

test("switches to French and stays on the same page", async ({ page }) => {
  await page.goto("/en/work");
  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitemradio", { name: "Français" }).click();

  await page.waitForURL("**/fr/work");
  await expect(page.getByRole("heading", { name: "Travaux", level: 1 })).toBeVisible();

  // The rail is translated too, not just the page body.
  const rail = page.getByRole("navigation", { name: "Navigation principale" }).first();
  await expect(rail.getByRole("link", { name: "Aujourd'hui" })).toBeVisible();
});

test("renders no untranslated message keys in French", async ({ page }) => {
  // A missing key renders as the key itself, which is how a half-translated
  // screen reaches production without anyone noticing.
  for (const route of ["/fr/today", "/fr/work", "/fr/people", "/fr/settings"]) {
    await page.goto(route);
    const body = await page.locator("body").innerText();
    expect(body, `${route} shows a raw message key`).not.toMatch(
      /\b(Nav|Shell|Search|Actions|Theme|Locale|Account|Org|Roles|Status|Common|Today|Work|Task|People|NewProject|Activity|Auth|Errors)\.[a-zA-Z]/,
    );
  }
});
