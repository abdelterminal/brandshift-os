import "server-only";

import { chromium, type Browser, type BrowserContext } from "playwright-core";

import { env } from "./env";
import {
  isAllowedPdfRequest,
  PdfBusyError,
  PdfRenderGate,
  runWithDeadline,
} from "./pdf-control";

/**
 * Turning a document into a PDF.
 *
 * The design lives in exactly one place -- `DocumentSheet` and the `.sheet`
 * rules in `globals.css` -- and this drives a headless Chromium to that same
 * print route rather than redrawing it. The alternative, a PDF library
 * building the page from scratch, is a second implementation of the letterhead
 * that would drift from the first the day either changed, and the devis this
 * design came from was already exactly that: a layout that existed only inside
 * a PDF generator, which is why it could not be reused anywhere.
 *
 * The print stylesheet is doing the real work here. `@page { size: A4 }` and
 * the `print-color-adjust` rules are what Chromium reads, so the file that
 * comes out of this is the same thing a person gets from Ctrl+P -- which also
 * means the two can never disagree.
 */

/** How long a single document may take before something is wrong. */
const RENDER_TIMEOUT_MS = 20_000;
const renderGate = new PdfRenderGate(2, 4, 5_000);

/**
 * Chromium is expensive to start and cheap to keep.
 *
 * One instance is reused across requests: launching costs a few hundred
 * milliseconds and a burst of memory, and doing it per request turns a
 * download into a visible wait. Each render still gets its own browser
 * *context*, so no two share cookies -- which matters, because the cookie is
 * somebody's session.
 */
let browserPromise: Promise<Browser> | null = null;

export class PdfUnavailableError extends Error {
  constructor(cause: string) {
    super(`No browser available to render PDFs: ${cause}`);
    this.name = "PdfUnavailableError";
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: env().PDF_CHROMIUM_PATH,
        timeout: RENDER_TIMEOUT_MS,
        // Docker's default seccomp profile blocks the namespaces Chromium's
        // sandbox needs. Granting SYS_ADMIN or an unconfined seccomp profile
        // would weaken the whole container more than disabling this one layer.
        // Compensating controls are explicit: the image runs as non-root,
        // Compose drops every capability and forbids privilege escalation, and
        // request interception below permits only this app's loopback origin.
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      })
      .catch((error: unknown) => {
        // Do not cache a failed launch: a missing browser is usually a missing
        // package, and the next request after somebody installs it should work
        // without a restart.
        browserPromise = null;
        throw new PdfUnavailableError(error instanceof Error ? error.message : String(error));
      });
  }

  const browser = await browserPromise;

  // A crashed or killed browser leaves a resolved promise pointing at a dead
  // object. Notice, and start again.
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }

  return browser;
}

/**
 * Render one of this application's own pages to a PDF.
 *
 * `path` is locale-scoped and absolute (`/en/finance/quotes/<id>/print`), and
 * `sessionCookie` is the caller's own session, forwarded so the headless
 * browser sees precisely what they would. It is never given a wider identity
 * than the person who asked: the route handler has already checked they may
 * read the document, and this cannot reach anything they could not.
 */
export async function renderPagePdf(path: string, sessionCookie: string): Promise<Buffer> {
  const release = await renderGate.acquire();
  const origin = `http://127.0.0.1:${env().PORT}`;
  let browserForRender: Browser | null = null;
  let context: BrowserContext | null = null;
  let timedOut = false;

  const render = async () => {
      browserForRender = await getBrowser();
      if (timedOut) throw new PdfBusyError("PDF rendering timed out.");

      context = await browserForRender.newContext();
      if (timedOut) {
        await context.close().catch(() => undefined);
        throw new PdfBusyError("PDF rendering timed out.");
      }
      await context.route("**/*", async (route) => {
        if (isAllowedPdfRequest(route.request().url(), origin)) {
          await route.continue();
        } else {
          await route.abort("blockedbyclient");
        }
      });

      await context.addCookies([
        {
          name: sessionCookie.split("=")[0]!,
          value: sessionCookie.split("=").slice(1).join("="),
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      const page = await context.newPage();
      const response = await page.goto(`${origin}${path}`, {
        waitUntil: "networkidle",
        timeout: RENDER_TIMEOUT_MS,
      });

      // The handler checked permission before getting here, so anything but a
      // 200 means the render itself went wrong -- and a PDF of an error page is
      // worse than no PDF, because it looks like a document.
      if (!response || !response.ok()) {
        throw new Error(
          `The print view returned ${response?.status() ?? "no response"} for ${path}`,
        );
      }

      // Belt and braces: if the sheet is not on the page, do not hand back a
      // blank sheet of A4 that looks like a successful download.
      await page.locator("article.sheet").first().waitFor({ timeout: RENDER_TIMEOUT_MS });

      return await page.pdf({
        // The stylesheet already declares A4 and its own 16mm margin, so let it
        // decide rather than imposing a second, conflicting page box here.
        preferCSSPageSize: true,
        printBackground: true,
      });
  };

  return runWithDeadline(
    render(),
    RENDER_TIMEOUT_MS,
    async () => {
      timedOut = true;
      if (context) {
        await context.close().catch(() => undefined);
      } else if (browserForRender) {
        // A context creation that exceeds the deadline indicates an unhealthy
        // shared browser. Closing it forces the pending operation to settle;
        // the next request will launch a clean process.
        browserPromise = null;
        await browserForRender.close().catch(() => undefined);
      }
    },
    async () => {
      await (context as BrowserContext | null)?.close().catch(() => undefined);
      release();
    },
  );
}

/**
 * A filename somebody can find again on their desktop.
 *
 * The document number leads, because that is what both sides of an invoice
 * dispute quote at each other. Everything is folded to ASCII and lower case:
 * this string crosses an HTTP header, a Windows filesystem and possibly an
 * email attachment, and each of the three dislikes something different.
 */
export function pdfFilename(kind: "quote" | "invoice", documentNumber: string, client: string) {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return [slug(documentNumber), kind, slug(client)].filter(Boolean).join("-") + ".pdf";
}
