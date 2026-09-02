/**
 * The context panel is empty unless a page fills it.
 *
 * Next needs a `default` for a parallel route so that navigating to a page
 * which does not render into `@panel` clears it rather than leaving the
 * previous page's panel on screen.
 */
export default function PanelDefault() {
  return null;
}
