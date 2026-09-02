import { ThemeToggle } from "@/components/theme";
import { LocaleSwitcher } from "@/components/shell/switchers";

/**
 * The signed-out frame.
 *
 * No rail, no palette, no organization -- none of it means anything before we
 * know who you are. Theme and language stay, because someone should be able to
 * read the sign-in page in their own language and without being flashbanged.
 */
export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="bg-surface-sunken flex min-h-dvh flex-col">
      <header className="flex items-center justify-end gap-1 px-4 py-3">
        <LocaleSwitcher />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        {children}
      </main>
    </div>
  );
}
