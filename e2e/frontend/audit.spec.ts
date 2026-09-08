import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email", { exact: true }).fill("amina.benali@brandshift.test");
  await page.getByLabel("Password", { exact: true }).fill("brandshift");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/today/, { timeout: 30000 });
});


test("responsive audit routes, locales and themes", async ({ page }, testInfo) => {
  test.setTimeout(600000);
  const warnings: string[] = [];
  page.on("console", msg => { if (msg.type() === "error" || msg.type() === "warning") {
    if (/Base UI|hydration|MISSING_MESSAGE/.test(msg.text())) warnings.push(msg.text().slice(0, 500));
  }});
  const routes = ["today", "work", "people", "settings", "insights", "finance/quotes/new", "finance/invoices/new", "work/new", "calendar", "crm", "leave", "profile"];
  for (const locale of ["en", "fr"]) for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`/${locale}/${route}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => ({
        width: innerWidth, actual: document.documentElement.scrollWidth,
        outliers: [...document.querySelectorAll("main *")].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > innerWidth + 1 && !el.closest('[role="region"]');
        }).slice(0, 4).map(el => el.outerHTML.slice(0, 150))
      }));
      expect.soft(overflow.actual, JSON.stringify({ locale, width, route, overflow })).toBeLessThanOrEqual(width + 1);
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations;
      expect.soft(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), `${locale} ${width} ${route}`).toEqual([]);
      if (["work","settings","finance/quotes/new"].includes(route)) await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${route.replaceAll("/", "-")}.png`), fullPage: true });
    }
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const width of [375, 414, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fr/insights");
    expect.soft(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    expect.soft((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(v => v.id)).toEqual([]);
  }
  expect.soft([...new Set(warnings)]).toEqual([]);
});

test("mobile directory, keyboard controls, tour and draft preview", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/today");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const drawer = page.locator('[data-slot="drawer-content"]');
  await expect(drawer.getByRole("link", { name: "Objectives", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(drawer).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("mobile-more.png") });
  await drawer.getByRole("link", { name: "Objectives", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await page.goto("/en/profile");
  await page.getByRole("button", { name: "Replay product tour" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator('[data-tour="mobile-nav"]')).toHaveAttribute("data-tour-active", "");
  await page.keyboard.press("Escape");
  await page.goto("/en/finance/quotes/new");
  await page.locator("#document-title").fill("Interface preview");
  await page.locator("#document-company").selectOption({ index: 1 });
  await page.getByRole("textbox", { name: "Description 1", exact: true }).fill("Design services");
  await page.getByRole("textbox", { name: "Unit price 1", exact: true }).fill("1200");
  await expect(page.locator("#document-preview")).toContainText("Design services");
  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("mobile-preview-filled.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("desktop-preview-filled.png"), fullPage: true });
});
