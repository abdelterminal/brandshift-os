"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

/** Server-side pagination, driven by `?page=`. */
export function PeoplePagination({
  page,
  pageSize,
  total,
  shown,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
}) {
  const t = useTranslations("People");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage === 1) return null;

  function go(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const from = (page - 1) * pageSize + 1;

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-caption text-fg-muted tabular-nums">
        {t("showing", { from, to: from + shown - 1, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          {t("previous")}
        </Button>
        <Button size="sm" disabled={page >= lastPage} onClick={() => go(page + 1)}>
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
