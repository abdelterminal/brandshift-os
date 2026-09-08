"use client";

import { Building2, ChevronsUpDown, Languages, LogOut, Settings, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { signOut, switchOrganization } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "../theme";
import { PersonAvatar } from "../ui/avatar";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { focusRing, transition } from "../ui/styles";

const triggerClass = cn(
  "text-label text-fg-muted hover:bg-surface-hover hover:text-fg-default",
  "inline-flex items-center gap-1.5 rounded-control px-2 py-1.5",
  focusRing,
  transition,
);

/**
 * Language.
 *
 * The locale is in the URL, so switching is a navigation to the same page in
 * the other language -- not a setting that quietly changes what a shared link
 * means for the next person.
 */
export function LocaleSwitcher() {
  const t = useTranslations("Locale");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Menu>
      <MenuTrigger
        className={triggerClass}
        aria-label={t("label")}
        data-pending={pending || undefined}
      >
        <Languages aria-hidden className="size-4" />
        <span className="uppercase">{locale}</span>
      </MenuTrigger>
      <MenuContent>
        {/* The label lives inside the radio group, not beside it: Base UI's
            group parts read a context that only Menu.Group and
            Menu.RadioGroup provide, and outside one they throw -- which took
            down the whole page the moment this menu was opened. */}
        <MenuRadioGroup
          value={locale}
          onValueChange={(next) => {
            startTransition(() => {
              // `usePathname()` gives the path with the locale already
              // stripped and dynamic segments already resolved, so switching
              // lands on the same record rather than the section's index.
              router.replace(pathname, { locale: next as Locale });
            });
          }}
        >
          <MenuGroupLabel>{t("label")}</MenuGroupLabel>
          {routing.locales.map((value) => (
            <MenuRadioItem key={value} value={value}>
              {t(value)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/**
 * Organization switcher.
 *
 * Present from day one because tenancy is. With one organization it still
 * shows which one you are in, which is the question it exists to answer.
 */
export function OrgSwitcher({
  organizations,
  currentId,
}: {
  organizations: Array<{ id: string; name: string; slug: string }>;
  currentId: string;
}) {
  const t = useTranslations("Org");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const current = organizations.find((org) => org.id === currentId);

  return (
    <Menu>
      <MenuTrigger className={cn(triggerClass, "max-w-full md:max-w-48")} aria-label={t("switch")}>
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{current?.name ?? t("label")}</span>
        <ChevronsUpDown aria-hidden className="text-fg-subtle size-3.5 shrink-0" />
      </MenuTrigger>
      <MenuContent align="start">
        {/* The label has to sit inside a Menu.Group: Base UI's group parts read
            a context only Menu.Group and Menu.RadioGroup provide, and throw
            without it -- which took the whole page down when this was opened. */}
        <MenuGroup>
          <MenuGroupLabel>{t("label")}</MenuGroupLabel>
          {organizations.map((org) => (
            <MenuItem
              key={org.id}
              className={org.id === currentId ? "font-medium" : undefined}
              onClick={() => {
                if (org.id === currentId) return;
                // Changing tenant is not a security boundary -- the membership
                // already decided what is visible -- so it needs no password.
                startTransition(async () => {
                  await switchOrganization(org.id);
                  router.refresh();
                });
              }}
            >
              <Building2 aria-hidden />
              <span className="truncate">{org.name}</span>
              {org.id === currentId ? (
                <span className="text-caption text-fg-subtle ml-auto">{t("current")}</span>
              ) : null}
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

/**
 * Account menu.
 *
 * The only home for Profile and Settings. Putting them in the rail as well
 * would cost two of five destinations and leave people unsure which of the two
 * routes they were on.
 */
export function AccountMenu({
  name,
  email,
  role,
  avatarUrl,
}: {
  name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "member";
  avatarUrl?: string | null;
}) {
  const t = useTranslations("Account");
  const roles = useTranslations("Roles");
  const ui = useTranslations("Ui");

  return (
    <Menu>
      <MenuTrigger
        aria-label={t("menu")}
        data-tour="account"
        // A ring, not `hover:opacity-85`. Dimming the trigger dimmed the
        // initials inside it to 4.19:1 -- fading a control that contains text
        // is a contrast failure wearing a hover state.
        className={cn(
          "rounded-pill ring-offset-2 ring-offset-surface-base",
          "hover:ring-border-hover hover:ring-2",
          focusRing,
          transition,
        )}
      >
        <PersonAvatar name={name} src={avatarUrl} size="md" />
      </MenuTrigger>
      <MenuContent>
        <div className="px-2 py-1.5">
          <p className="text-caption text-fg-subtle">{t("signedInAs")}</p>
          <p className="text-label text-fg-default mt-0.5 truncate">{name}</p>
          <p className="text-caption text-fg-muted truncate">{email}</p>
          <p className="text-caption text-fg-subtle mt-1">{roles(role)}</p>
        </div>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/profile" />}>
          <User aria-hidden />
          {t("profile")}
        </MenuLinkItem>
        <MenuLinkItem render={<Link href="/settings" />}>
          <Settings aria-hidden />
          {t("settings")}
        </MenuLinkItem>
        <div className="border-border my-2 border-y px-2 py-3 md:hidden">
          <p className="text-caption text-fg-muted mb-2">{ui("preferences")}</p>
          <div className="flex flex-wrap items-center gap-2"><LocaleSwitcher /><ThemeToggle /></div>
        </div>
        <MenuSeparator />
        {/* Revokes the session row as well as clearing the cookie, so the
            token cannot be replayed even if it was captured. */}
        <MenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden />
          {t("signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
