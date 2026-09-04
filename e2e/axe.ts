import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * The accessibility sweep.
 *
 * Contrast is already held to AA by a unit test that reads `tokens.css`
 * directly. This covers everything that test cannot see: landmark structure,
 * heading order, form labelling, ARIA correctness, focus order.
 *
 * WCAG 2.1 A and AA only. The best-practice rules axe also ships are opinions
 * worth reading but not worth failing a build over, and a suite that cries
 * wolf gets muted.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export async function expectNoAxeViolations(page: Page, label: string) {
  // Wait for the document to have a title before scanning.
  //
  // `generateMetadata` is async and streams, so the `<title>` arrives after
  // the body it describes. Scanning in between yields exactly one violation --
  // `document-title` -- against a page that is perfectly fine a moment later.
  // It bit roughly one full run in four, always on a different test, which is
  // the worst kind of failure: real-looking, unreproducible in isolation, and
  // eventually ignored.
  await expect
    .poll(() => page.title(), { timeout: 5000, message: `${label}: no <title> ever arrived` })
    .not.toBe("");

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const summary = results.violations
    .map((violation) => {
      const where = violation.nodes
        .slice(0, 3)
        .map((node) => `      ${node.target.join(" ")}`)
        .join("\n");
      return `  [${violation.impact}] ${violation.id}: ${violation.help}\n${where}`;
    })
    .join("\n");

  expect(results.violations, `${label}\n${summary}`).toEqual([]);
}
