"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useTransition } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "./button";
import { Skeleton } from "./feedback";

function useSection() {
  const nav = useTranslations("Nav");
  const account = useTranslations("Account");
  const ui = useTranslations("Ui");
  const path = usePathname().split("/").filter(Boolean);
  const key = path[0] ?? "";
  return nav.has(key) ? nav(key) : account.has(key) ? account(key) : ui("page");
}
export function RouteLoading() {
  const t = useTranslations("Ui");
  const section = useSection();
  return <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8" aria-busy="true">
    <h1 className="text-display font-display text-fg-default">{section}</h1>
    <p role="status" className="text-body text-fg-muted mt-2">{t("loading", { section })}</p>
    <div aria-hidden="true" className="mt-6">
      <div className="mb-4 flex gap-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-10 w-28" /></div>
      <div className="border-border divide-border overflow-hidden rounded-card border divide-y">
        {Array.from({ length: 6 }, (_, i) => <div className="flex gap-4 px-4 py-5" key={i}>
          <Skeleton className="h-5 flex-1" /><Skeleton className="h-5 w-20" /><Skeleton className="hidden h-5 w-24 sm:block" />
        </div>)}
      </div>
    </div>
  </div>;
}
export function RouteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Ui");
  const section = useSection();
  const ref = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { ref.current?.focus(); }, []);
  return <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
    <h1 ref={ref} tabIndex={-1} className="text-display font-display text-fg-default outline-none">{t("errorTitle", { section })}</h1>
    <p role="alert" className="text-body text-fg-muted mt-3">{t("errorBody")}</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <Button variant="primary" loading={pending} onClick={() => startTransition(retry)}>{t("retry")}</Button>
      <Button render={<Link href="/today" />}>{t("back")}</Button>
    </div>
  </section>;
}
