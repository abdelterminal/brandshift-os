import type { Metadata } from "next";

import { contrastRatio, ramp, readTokens, resolveToken, type Theme } from "@/lib/tokens";

/**
 * The design system reference.
 *
 * Internal, not part of the product, and deliberately not locale-scoped -- it
 * is a tool for building the app rather than a screen in it.
 *
 * Everything here is read out of `src/app/tokens.css` at render time. The
 * swatches are the real values and the contrast figures are the real figures,
 * computed by the same module the build test uses, so this page cannot drift
 * away from what actually ships.
 */

export const metadata: Metadata = { title: "Design system" };

const TOKENS = readTokens();

function ratio(fg: string, bg: string, theme: Theme): string {
  return contrastRatio(resolveToken(fg, theme), resolveToken(bg, theme)).toFixed(2);
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-t pt-10">
      <h2 className="text-heading-lg font-display text-fg-default">{title}</h2>
      {intro ? <p className="text-fg-muted mt-2 max-w-2xl text-body">{intro}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Ramp({ name, label }: { name: string; label: string }) {
  const steps = ramp(name, TOKENS);
  return (
    <div>
      <h3 className="text-label text-fg-default">{label}</h3>
      {/* Seventeen steps do not fit at 320px, so the strip scrolls rather than
          squeezing the step numbers below the 12px floor. */}
      <div className="border-border mt-2 overflow-x-auto rounded-card border">
        <div className="flex min-w-[34rem]">
          {steps.map(([token, value]) => (
            <div key={token} className="min-w-0 flex-1">
              <div className="h-14" style={{ backgroundColor: value }} />
              <div className="bg-surface-raised px-1 py-1.5 text-center">
                <div className="text-caption text-fg-default tabular-nums">
                  {token.split("-").pop()}
                </div>
                <div className="text-caption text-fg-subtle hidden tabular-nums sm:block">
                  {value.replace("#", "")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SemanticRow({
  token,
  role,
  against,
  minimum,
}: {
  token: string;
  role: string;
  against?: string;
  minimum?: number;
}) {
  const light = resolveToken(token, "light");
  const dark = resolveToken(token, "dark");

  return (
    <tr className="border-border border-t">
      <td className="py-2 pr-4 align-top">
        <code className="text-label text-fg-default">{token}</code>
        <div className="text-caption text-fg-muted mt-0.5">{role}</div>
      </td>
      <td className="py-2 pr-4 align-top">
        <div className="flex items-center gap-2">
          <span
            className="border-border size-5 shrink-0 rounded-[6px] border"
            style={{ backgroundColor: light }}
          />
          <code className="text-caption text-fg-muted tabular-nums">{light}</code>
        </div>
      </td>
      <td className="py-2 pr-4 align-top">
        <div className="flex items-center gap-2">
          <span
            className="border-border size-5 shrink-0 rounded-[6px] border"
            style={{ backgroundColor: dark }}
          />
          <code className="text-caption text-fg-muted tabular-nums">{dark}</code>
        </div>
      </td>
      <td className="py-2 align-top">
        {against && minimum ? (
          <div className="text-caption tabular-nums">
            <span className="text-complete-text">{ratio(token, against, "light")}:1</span>
            <span className="text-fg-subtle"> / </span>
            <span className="text-complete-text">{ratio(token, against, "dark")}:1</span>
            <div className="text-fg-subtle">needs {minimum}:1</div>
          </div>
        ) : (
          <span className="text-caption text-fg-subtle">--</span>
        )}
      </td>
    </tr>
  );
}

type Tone = "complete" | "attention" | "active" | "blocked";

/**
 * Written out rather than composed from the tone name. Tailwind scans source
 * text for complete class names, so `bg-${tone}-bg` would generate nothing.
 */
const TONE_PILL: Record<Tone, string> = {
  complete: "bg-complete-bg text-complete-text border-complete-border",
  attention: "bg-attention-bg text-attention-text border-attention-border",
  active: "bg-active-bg text-active-text border-active-border",
  blocked: "bg-blocked-bg text-blocked-text border-blocked-border",
};

const TONE_DOT: Record<Tone, string> = {
  complete: "bg-complete-solid",
  attention: "bg-attention-solid",
  active: "bg-active-solid",
  blocked: "bg-blocked-solid",
};

function StatusPill({ tone, label, meaning }: { tone: Tone; label: string; meaning: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`${TONE_PILL[tone]} text-label inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1`}
      >
        <span className={`${TONE_DOT[tone]} size-1.5 rounded-pill`} aria-hidden />
        {label}
      </span>
      <span className="text-fg-muted text-body">{meaning}</span>
    </div>
  );
}

const TYPE_SPECIMENS: Array<{
  token: string;
  className: string;
  px: string;
  family: string;
  use: string;
  sample: string;
}> = [
  {
    token: "display-lg",
    className: "text-display-lg font-display",
    px: "32px",
    family: "Space Grotesk",
    use: "Page title, one per screen",
    sample: "Meridian rebrand",
  },
  {
    token: "display",
    className: "text-display font-display",
    px: "28px",
    family: "Space Grotesk",
    use: "Section title on a landing surface",
    sample: "Today",
  },
  {
    token: "heading-lg",
    className: "text-heading-lg font-display",
    px: "22px",
    family: "Space Grotesk",
    use: "Card and panel titles",
    sample: "Blocked and overdue",
  },
  {
    token: "heading",
    className: "text-heading font-display",
    px: "18px",
    family: "Space Grotesk",
    use: "Sub-sections, drawer titles",
    sample: "Team workload",
  },
  {
    token: "body-lg",
    className: "text-body-lg",
    px: "16px",
    family: "Inter",
    use: "Reading text, empty-state copy",
    sample: "Nothing is blocked. Six tasks are due this week.",
  },
  {
    token: "body",
    className: "text-body",
    px: "14px",
    family: "Inter",
    use: "The default. Tables, forms, everything",
    sample: "Catalogue export from the legacy storefront",
  },
  {
    token: "label",
    className: "text-label",
    px: "13px",
    family: "Inter",
    use: "Field labels, buttons, table headers",
    sample: "Assignee",
  },
  {
    token: "caption",
    className: "text-caption",
    px: "12px",
    family: "Inter",
    use: "Timestamps and counts. The floor -- nothing goes below",
    sample: "Updated 4 minutes ago",
  },
];

/* -------------------------------------------------------------------------- */

export default function DesignSystemPage() {
  return (
    <div>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <header>
          <h1 className="text-display-lg font-display text-fg-default">Tokens</h1>
          <p className="text-fg-muted mt-2 max-w-2xl text-body-lg">
            Read live from <code className="text-label">src/app/tokens.css</code>. Every
            contrast figure on this page is computed by the same module that fails the build
            when a pair drops below AA.
          </p>
        </header>

        <div className="mt-12 space-y-12">
          <Section
            title="The brand red"
            intro="#FF3B22 is the identity. It carries white text at 3.56:1, which is below the 4.5:1 AA needs for a 14px button label -- so the ramp keeps 500 as the identity colour and puts the interactive fill one step down at 600. Both are the brand red; only one of them is legible under a label."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="border-border overflow-hidden rounded-card border">
                <div className="flex h-24 items-center justify-center bg-brand">
                  <span className="text-body text-fg-on-accent font-medium">White label</span>
                </div>
                <div className="bg-surface-raised p-3">
                  <div className="text-label text-fg-default">--brand / red-500</div>
                  <div className="text-caption text-fg-muted mt-1">
                    #FF3B22 -- logo, active nav indicator, focus ring
                  </div>
                  <div className="text-caption text-blocked-text mt-1 tabular-nums">
                    3.56:1 on white -- non-text use only
                  </div>
                </div>
              </div>

              <div className="border-border overflow-hidden rounded-card border">
                <div className="bg-accent flex h-24 items-center justify-center">
                  <span className="text-body text-accent-fg font-medium">White label</span>
                </div>
                <div className="bg-surface-raised p-3">
                  <div className="text-label text-fg-default">--accent / red-600</div>
                  <div className="text-caption text-fg-muted mt-1">
                    Primary action, destructive action
                  </div>
                  <div className="text-caption text-complete-text mt-1 tabular-nums">
                    {ratio("--fg-on-accent", "--accent", "light")}:1 -- passes AA
                  </div>
                </div>
              </div>

              <div className="border-border overflow-hidden rounded-card border">
                <div className="bg-surface-raised flex h-24 items-center justify-center gap-2 p-3">
                  <button
                    type="button"
                    className="bg-accent text-accent-fg text-label hover:bg-accent-hover active:bg-accent-active focus-visible:outline-focus-ring rounded-control px-3 py-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Publish project
                  </button>
                </div>
                <div className="bg-surface-raised border-border border-t p-3">
                  <div className="text-label text-fg-default">The ladder</div>
                  <div className="text-caption text-fg-muted mt-1">
                    Light: 600 &rarr; 700 &rarr; 800, progressively darker. Dark: hover
                    brightens to 550, press recedes to 700.
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Ramps"
            intro="Generated in OKLCH at a fixed hue per family, so the lightness steps are perceptually even. Components never name these directly."
          >
            <div className="space-y-6">
              <Ramp name="neutral" label="Neutral -- hue 40, chroma <= 0.008. Warm charcoal, never pure black." />
              <Ramp name="red" label="Red -- hue 30.92, step 500 is exactly #FF3B22" />
              <Ramp name="green" label="Green -- complete" />
              <Ramp name="amber" label="Amber -- due soon, needs attention" />
              <Ramp name="blue" label="Blue -- active, in progress" />
            </div>
          </Section>

          <Section
            title="Status semantics"
            intro="Four meanings, four colours, and no colour ever means two things. Red is the only one that doubles as the accent, which is why it is capped at 5% of a screen."
          >
            <div className="space-y-3">
              <StatusPill tone="complete" label="Complete" meaning="Done. Green, and only this." />
              <StatusPill
                tone="attention"
                label="Due soon"
                meaning="Needs attention before it becomes a problem."
              />
              <StatusPill tone="active" label="In progress" meaning="Active, someone is on it." />
              <StatusPill
                tone="blocked"
                label="Blocked"
                meaning="Blocked or overdue. The only status that borrows the brand red."
              />
            </div>
          </Section>

          <Section
            title="Semantic tokens"
            intro="What components actually name. Ratios are light / dark against the surface each token is meant to sit on."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr>
                    <th className="text-label text-fg-muted pb-2 font-medium">Token</th>
                    <th className="text-label text-fg-muted pb-2 font-medium">Light</th>
                    <th className="text-label text-fg-muted pb-2 font-medium">Dark</th>
                    <th className="text-label text-fg-muted pb-2 font-medium">Contrast</th>
                  </tr>
                </thead>
                <tbody>
                  <SemanticRow token="--surface-sunken" role="Page well, table stripe" />
                  <SemanticRow token="--surface-base" role="The canvas" />
                  <SemanticRow token="--surface-raised" role="Cards, panels" />
                  <SemanticRow token="--surface-overlay" role="Dialogs, drawers, menus" />
                  <SemanticRow
                    token="--fg-default"
                    role="Primary text"
                    against="--surface-base"
                    minimum={4.5}
                  />
                  <SemanticRow
                    token="--fg-muted"
                    role="Secondary text, labels"
                    against="--surface-base"
                    minimum={4.5}
                  />
                  <SemanticRow
                    token="--fg-subtle"
                    role="Timestamps, placeholders"
                    against="--surface-base"
                    minimum={4.5}
                  />
                  <SemanticRow token="--border" role="Dividers, table rules" />
                  <SemanticRow
                    token="--border-control"
                    role="Input and checkbox edges"
                    against="--surface-base"
                    minimum={3}
                  />
                  <SemanticRow
                    token="--focus-ring"
                    role="Keyboard focus"
                    against="--surface-base"
                    minimum={3}
                  />
                  <SemanticRow
                    token="--accent-text"
                    role="Links, accent text"
                    against="--surface-base"
                    minimum={4.5}
                  />
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Type scale"
            intro="Space Grotesk sets display and headings; Inter does everything else. Both self-hosted, both variable. Body is 14px, and 12px is the floor."
          >
            <div className="border-border divide-border divide-y rounded-card border">
              {TYPE_SPECIMENS.map((specimen) => (
                <div
                  key={specimen.token}
                  className="bg-surface-raised flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <div className="sm:w-44 sm:shrink-0">
                    <code className="text-label text-fg-default">text-{specimen.token}</code>
                    <div className="text-caption text-fg-muted mt-0.5 tabular-nums">
                      {specimen.px} &middot; {specimen.family}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`${specimen.className} text-fg-default truncate`}>
                      {specimen.sample}
                    </p>
                    <p className="text-caption text-fg-subtle mt-1">{specimen.use}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Shape and motion"
            intro="Three radii, one per kind of container. Transitions move colour and opacity only, never position or size, and collapse entirely when the viewer asks for less motion."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="border-border bg-surface-raised rounded-control border p-4">
                <div className="text-label text-fg-default">8px -- controls</div>
                <p className="text-caption text-fg-muted mt-1">
                  Buttons, inputs, selects, menu items
                </p>
              </div>
              <div className="border-border bg-surface-raised rounded-card border p-4">
                <div className="text-label text-fg-default">12px -- cards</div>
                <p className="text-caption text-fg-muted mt-1">Cards, panels, table containers</p>
              </div>
              <div className="border-border bg-surface-raised rounded-surface border p-4">
                <div className="text-label text-fg-default">16px -- surfaces</div>
                <p className="text-caption text-fg-muted mt-1">Dialogs, drawers, sheets</p>
              </div>
            </div>

            <div className="border-border bg-surface-raised rounded-card mt-4 border p-4">
              <div className="text-label text-fg-default">Motion</div>
              <p className="text-caption text-fg-muted mt-1">
                120ms fast &middot; 150ms base &middot; 180ms slow, all on{" "}
                <code>cubic-bezier(0.2, 0, 0, 1)</code>. Hover any control on this page to see
                the whole vocabulary.
              </p>
            </div>
          </Section>

          <Section
            title="The 5% rule"
            intro="Red is capped at 5% of any screen. Below is roughly what that budget buys: one primary action, one active nav item, and the blocked count. Everything else earns attention through position and weight instead."
          >
            <div className="border-border bg-surface-raised rounded-card border p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <nav className="bg-sidebar-surface border-sidebar-border rounded-control w-full shrink-0 border p-2 sm:w-44">
                  {["Today", "Work", "People", "Insights", "Inbox"].map((item, index) => (
                    <div
                      key={item}
                      className={[
                        "text-label rounded-[6px] px-2.5 py-2",
                        index === 0
                          ? "bg-sidebar-active-bg text-accent-text border-brand border-l-2"
                          : "text-sidebar-fg",
                      ].join(" ")}
                    >
                      {item}
                    </div>
                  ))}
                </nav>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-heading font-display text-fg-default">Today</h3>
                    <button
                      type="button"
                      className="bg-accent text-accent-fg text-label hover:bg-accent-hover active:bg-accent-active focus-visible:outline-focus-ring rounded-control px-3 py-2 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      New project
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(
                      [
                        { label: "Blocked", tone: "blocked", count: 6 },
                        { label: "Overdue", tone: "attention", count: 8 },
                        { label: "In progress", tone: "active", count: 13 },
                        { label: "Completed this week", tone: "complete", count: 23 },
                      ] as Array<{ label: string; tone: Tone; count: number }>
                    ).map((row) => (
                      <div
                        key={row.label}
                        className="border-border bg-surface-base rounded-control flex items-center justify-between border px-3 py-2"
                      >
                        <span className="text-body text-fg-default flex items-center gap-2">
                          <span
                            className={`${TONE_DOT[row.tone]} size-2 rounded-pill`}
                            aria-hidden
                          />
                          {row.label}
                        </span>
                        <span className="text-label text-fg-muted tabular-nums">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>

        <footer className="border-border text-caption text-fg-subtle mt-14 border-t pt-6">
          The components built on these tokens are on the Primitives page.
        </footer>
      </div>
    </div>
  );
}
