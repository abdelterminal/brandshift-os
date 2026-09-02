import { test } from "@playwright/test";

import { expectNoAxeViolations } from "../axe";
import { PUBLIC_ROUTES } from "../routes";

for (const route of PUBLIC_ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expectNoAxeViolations(page, route);
  });
}

test("the sign-in form is still clean while showing an error", async ({ page }) => {
  await page.goto("/en/login");

  await page.getByLabel("Email").fill("nobody@brandshift.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByText("That email and password do not match.").waitFor();
  await expectNoAxeViolations(page, "/en/login with an error");
});
