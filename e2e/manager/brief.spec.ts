import { expect, test, type Page } from "@playwright/test";

/**
 * The client brief.
 *
 * Written sections plus the files a job is judged against, readable by
 * everyone in the organization and editable only from manager up. The parts
 * worth asserting are the three the feature was asked for: that somebody who
 * has never written a brief is given the questions, that a file genuinely
 * survives a round trip to disk and back, and that the limits are enforced on
 * the server rather than only by the file picker.
 */

const main = (page: Page) => page.locator("#main");

/** A real PDF, minimal but genuinely one -- the server reads the type. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

/** A real 1x1 PNG, so the image branch is exercised with actual image bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Open a project's Brief tab. The tab is addressable, so no clicking about. */
async function openBrief(page: Page, key: string) {
  await page.goto(`/en/work/${key}?tab=brief`);
  await expect(page.getByRole("tab", { name: "Brief", selected: true })).toBeVisible();
}

test("somebody who has never written a brief is handed the questions", async ({ page }) => {
  await openBrief(page, "HAR");

  await expect(main(page).getByText("No brief yet")).toBeVisible();
  await main(page).getByRole("button", { name: "Start from the template" }).click();

  const dialog = page.getByRole("dialog");
  // The template is the whole answer to "I do not know how to write one of
  // these": the sections arrive as the questions a brief should answer,
  // already filled into the editor rather than described somewhere else.
  for (const heading of ["Background", "Objective", "Audience", "Deliverables"]) {
    await expect(dialog.locator(`input[value="${heading}"]`)).toBeVisible();
  }

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // And it is now the brief, not a draft somewhere.
  await expect(main(page).getByRole("heading", { name: /brief/i }).first()).toBeVisible();
  await expect(main(page).getByText("Background")).toBeVisible();
});

test("a file survives the round trip to disk and back", async ({ page }) => {
  await openBrief(page, "HAR");

  // The brief from the previous test is here; if that one was skipped, write
  // the smallest possible brief so this test stands on its own.
  if (await main(page).getByText("No brief yet").isVisible().catch(() => false)) {
    await main(page).getByRole("button", { name: "Write it from scratch" }).click();
    const write = page.getByRole("dialog");
    await write.getByRole("textbox").first().fill("Harbour brief");
    await write.getByRole("button", { name: "Save" }).click();
    await expect(write).toBeHidden();
  }

  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: "signed-proposal.pdf", mimeType: "application/pdf", buffer: PDF });

  const row = main(page).locator("li", { hasText: "signed-proposal.pdf" });
  await expect(row).toBeVisible();

  // The actual proof: fetch it back through the authenticated route and
  // compare the bytes, rather than trusting that a row appeared.
  const href = await row.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(href).toBeTruthy();

  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  // Never inline: a file served from this origin that renders in the tab is
  // how it gets to run script in it.
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(Buffer.from(await response.body()).equals(PDF)).toBe(true);

  // A photograph too, since "if there are photos" was half the ask.
  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: "moodboard.png", mimeType: "image/png", buffer: PNG });
  await expect(main(page).locator("li", { hasText: "moodboard.png" })).toBeVisible();
});

test("the limits are the server's, not the file picker's", async ({ page, request }) => {
  await openBrief(page, "HAR");

  // The picker's `accept` is a convenience and can be bypassed by anybody who
  // wants to, so what matters is that the action refuses. Driven through the
  // input anyway, because that is the path a real refusal takes.
  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "payload.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ", "utf8"),
    });

  await expect(
    main(page).getByText("Only PDF, PNG, JPEG and WebP files can be attached."),
  ).toBeVisible();
  await expect(main(page).locator("li", { hasText: "payload.exe" })).toHaveCount(0);

  // And an id that is not ours resolves to nothing rather than to somebody
  // else's file -- every read goes through withOrg().
  const stranger = await request.get("/api/attachments/00000000-0000-4000-8000-000000000000");
  expect(stranger.status()).toBe(404);
});

test("a member can read the brief and cannot touch it", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/member.json" });
  const page = await context.newPage();

  // NOR rather than HAR: a member who is not on a project gets a 404 for the
  // whole page, so asserting "no edit controls" there would pass for the
  // wrong reason. Lukas is a contributor on NOR, which is the case worth
  // testing -- somebody who *can* see the work and still may not change what
  // was agreed.
  await page.goto("/en/work/NOR?tab=brief");

  // Reading is open to the whole organization -- that is the point of it.
  await expect(page.getByRole("tab", { name: "Brief" })).toBeVisible();

  // Editing is not. No control, anywhere on the panel.
  await expect(main(page).getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Add a file" })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Start from the template" })).toHaveCount(0);
  await expect(main(page).locator('input[type="file"]')).toHaveCount(0);

  await context.close();
});
