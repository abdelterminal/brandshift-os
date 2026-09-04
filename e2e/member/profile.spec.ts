import { expect, test, type Page } from "@playwright/test";

/**
 * Your own profile.
 *
 * It was a `PagePlaceholder` for eight milestones -- reachable from the avatar
 * menu and rendering nothing, which is the plainest possible breach of "a user
 * must never feel lost".
 *
 * What is worth protecting now it exists is the division: what you may change
 * about yourself, and what you may not. A person who can grant themselves the
 * `finance` flag is not a permission system.
 */

const main = (page: Page) => page.locator("#main");
const save = (page: Page) => page.getByRole("button", { name: "Save" });

test("shows what you may change, and what is set for you", async ({ page }) => {
  await page.goto("/en/profile");

  // Not a placeholder any more.
  await expect(main(page).getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();

  // Editable.
  await expect(main(page).getByLabel("Name")).toBeVisible();
  await expect(main(page).getByLabel("Job title")).toBeVisible();
  // Scoped: the shell has its own language switcher with the same label.
  await expect(main(page).getByLabel("Language")).toBeVisible();

  // Shown, and read-only. Somebody looking for their role should find it and
  // see it is not theirs to set, rather than wonder where it went.
  await expect(main(page).getByText("Set by an owner or an admin, not by you.")).toBeVisible();
  await expect(main(page).getByText("Role", { exact: true })).toBeVisible();
});

test("names the role in words, not as a message key", async ({ page }) => {
  await page.goto("/en/profile");

  // The first version of this page read the `Role` catalogue, which is called
  // `Roles`, and printed a literal "Role.member" on screen.
  await expect(main(page).getByText(/Role\.[a-z]+/)).toHaveCount(0);
  await expect(main(page).getByText("Member", { exact: true })).toBeVisible();
});

test("a change to your own name sticks, and reaches the shell", async ({ page }) => {
  const name = `Lukas Weber ${String(Date.now()).slice(-4)}`;

  await page.goto("/en/profile");
  await main(page).getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  // Wait for the write to finish before reloading. The button carries
  // `aria-busy` while the action runs, which is a deterministic signal --
  // unlike the toast, which dismisses itself on a timer. Without this the
  // reload races the action and reads the row as it was.
  await expect(save(page)).not.toHaveAttribute("aria-busy", "true");
  await page.reload();
  await expect(main(page).getByLabel("Name")).toHaveValue(name);

  // The avatar menu reads the same row, so it has to have moved too. The
  // shell shows initials until the menu is opened, which is why this opens it
  // rather than looking for the name on the page.
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Put it back, so the rest of the suite sees the seeded name.
  await main(page).getByLabel("Name").fill("Lukas Weber");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(save(page)).not.toHaveAttribute("aria-busy", "true");
  await page.reload();
  await expect(main(page).getByLabel("Name")).toHaveValue("Lukas Weber");
});

test("offers no way to change your own role or permissions", async ({ page }) => {
  await page.goto("/en/profile");

  // The whole point. These are terms of employment, not preferences.
  await expect(main(page).getByLabel("Role")).toHaveCount(0);
  await expect(main(page).getByLabel("Department")).toHaveCount(0);
  await expect(main(page).getByLabel("Modules")).toHaveCount(0);
});

test("points at the neighbouring screens rather than repeating them", async ({ page }) => {
  await page.goto("/en/profile");

  // Devices and passwords live in Settings and are not duplicated here.
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await expect(
    main(page).getByRole("link", { name: "Signed-in devices and password" }),
  ).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Your time off" })).toBeVisible();
});
