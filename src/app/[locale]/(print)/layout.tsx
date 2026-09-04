import { setRequestLocale } from "next-intl/server";

/**
 * The layout for documents that leave the building.
 *
 * There is deliberately no shell here -- no rail, no palette, no avatar menu.
 * A quote on screen should be the quote, not the quote inside an application,
 * because the next thing that happens to it is Ctrl+P and anything around it
 * is either wasted ink or a second page.
 *
 * These routes are not public. They sit outside `(app)`, so they do not get
 * that layout's `requireUser()` -- each page calls `requirePermission()`
 * itself, which is the real boundary in any case. The middleware keeps a
 * stranger off the path entirely.
 */
export default async function PrintLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <div className="bg-surface-sunken min-h-full">{children}</div>;
}
