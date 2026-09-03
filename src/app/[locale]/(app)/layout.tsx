import { getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { AccountMenu, LocaleSwitcher, OrgSwitcher } from "@/components/shell/switchers";
import { ThemeToggle } from "@/components/theme";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { bottomNavFor, overflowFor, railFor, withChannels } from "@/lib/navigation";
import { listJoinedChannels } from "@/lib/data/channels";
import { unreadCount } from "@/lib/data/notifications";
import { paletteIndex } from "@/lib/palette";
import { requireUser } from "@/lib/auth/guards";

/**
 * Everything inside the shell is per-person: the rail comes from your role,
 * the palette from your organization. Prerendering it would bake one user's
 * shell into HTML served to everyone -- and would need a database at build
 * time, which the Docker image does not have.
 */
export const dynamic = "force-dynamic";

/**
 * The app shell.
 *
 * Rail on the left, one persistent top bar, a context panel slot on the right,
 * and a bottom nav on small screens. Everything about where you are lives in
 * the frame; the page below only has to render its own content.
 *
 * The rail is built from the signed-in person's role, so a member never sees
 * a destination they cannot use and then discovers it refuses them.
 */
export default async function AppLayout({ children, panel, params }: LayoutProps<"/[locale]">) {
  await params;

  // Full session check on every render: digest, revocation, expiry and
  // password-change invalidation. The middleware only checked the signature.
  const [session, t, nav] = await Promise.all([
    requireUser(),
    getTranslations("Shell"),
    getTranslations("Nav"),
  ]);
  const { actor, user, membership, organization, organizations } = session;

  const [entries, inboxUnread, channels] = await Promise.all([
    paletteIndex(actor),
    unreadCount(actor),
    listJoinedChannels(actor),
  ]);

  // Every number on the rail is a count of rows you can go and act on -- never
  // a badge meaning "something happened somewhere". Channels are keyed by their
  // own id, so a nested row shows the messages waiting in that one room.
  const counts: Record<string, number> = { inbox: inboxUnread };
  for (const channel of channels) counts[channel.id] = channel.unread;

  const rail = withChannels(railFor(actor), channels, nav("allChannels"));

  return (
    <TooltipProvider delay={400}>
      <ToastProvider>
        <a
          href="#main"
          className="text-label bg-surface-raised text-fg-default border-border focus:outline-focus-ring sr-only rounded-control border px-3 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100 focus:outline-2"
        >
          {t("skipToContent")}
        </a>

        <div className="flex min-h-dvh">
          <Sidebar destinations={rail} organizationName={organization.name} counts={counts} />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-border bg-surface-base/90 sticky top-0 z-30 border-b backdrop-blur">
              <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="md:hidden">
                    <OrgSwitcher organizations={organizations} currentId={organization.id} />
                  </div>
                  <div className="hidden md:block">
                    <Breadcrumbs />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <CommandPalette entries={entries} />
                  <div className="hidden md:block">
                    <OrgSwitcher organizations={organizations} currentId={organization.id} />
                  </div>
                  <LocaleSwitcher />
                  <ThemeToggle />
                  <AccountMenu
                    name={user.name}
                    email={user.email}
                    role={membership.role}
                    avatarUrl={user.avatarUrl}
                  />
                </div>
              </div>

              {/* Breadcrumbs move under the bar on small screens, where the
                  bar itself has no room for them. */}
              <div className="border-border border-t px-3 py-2 md:hidden">
                <Breadcrumbs />
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
                {children}
              </main>

              {/*
                The context panel. A parallel route, so a page fills it by
                rendering into `@panel` and every other page leaves it empty
                without having to say so.
              */}
              {panel}
            </div>
          </div>
        </div>

        <BottomNav
          destinations={bottomNavFor(actor)}
          overflow={overflowFor(actor)}
          counts={counts}
        />
        <ToastViewport />
      </ToastProvider>
    </TooltipProvider>
  );
}
