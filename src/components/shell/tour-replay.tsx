"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
export function TourReplay() {
  const t = useTranslations("Ui");
  return <section className="border-border mt-6 border-t pt-6">
    <Button onClick={() => window.dispatchEvent(new Event("brandshift:replay-tour"))}>{t("replayTour")}</Button>
    <p className="text-body text-fg-muted mt-2">{t("tourBody")}</p>
  </section>;
}
