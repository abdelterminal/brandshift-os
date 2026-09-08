"use client";

import { Laptop, Smartphone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField } from "@/components/auth/password-field";
import {
  confirmPassword,
  revokeAllOtherDevices,
  revokeDevice,
  type FormState,
} from "@/lib/auth/actions";
import type { DeviceSession } from "@/lib/auth/session";

/**
 * Signed-in devices, with per-device revoke.
 *
 * Revoking is destructive -- it locks someone out of a browser they may be
 * using -- so it needs a password confirmed within the last fifteen minutes.
 * Signing in counts as confirming, so in practice this only asks once you have
 * been sitting in the app for a while, which is exactly when it should.
 *
 * Note what does *not* ask: nothing routine. That is the rule the old app
 * broke by prompting on every save, until people typed their password without
 * reading what they were agreeing to.
 */

/** "Chrome on Windows" from a user-agent, or nothing if it cannot be read. */
function describeDevice(userAgent: string | null): { label: string | null; mobile: boolean } {
  if (!userAgent) return { label: null, mobile: false };

  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;
  const platform =
    /Windows/.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/.test(userAgent) ? "macOS"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  if (!browser && !platform) return { label: null, mobile };
  return { label: [browser, platform].filter(Boolean).join(" · "), mobile };
}

export function SessionsPanel({ devices }: { devices: DeviceSession[] }) {
  const t = useTranslations("Auth");
  const format = useFormatter();
  const ui = useTranslations("Ui");
  const [showAll, setShowAll] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [pending, startTransition] = useTransition();

  function handle(result: Promise<FormState>) {
    startTransition(async () => {
      const state = await result;
      if (state.error === "reauthRequired") {
        setNeedsReauth(true);
        setMessage(t("reauthRequired"));
        return;
      }
      setNeedsReauth(false);
      setMessage(state.error ? t(state.error) : t("sessionRevoked"));
    });
  }

  const others = devices.filter((device) => !device.current);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("sessions")}</CardTitle>
          <p className="text-body text-fg-muted mt-1">{t("sessionsBody")}</p>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <ul className="divide-border divide-y">
          {[...devices].sort((a, b) => Number(b.current) - Number(a.current)).filter(device => showAll || device.current).map((device) => {
            const { label, mobile } = describeDevice(device.userAgent);
            const Icon = mobile ? Smartphone : Laptop;

            return (
              <li key={device.id} className="flex items-center gap-3 py-3">
                <Icon aria-hidden className="text-fg-subtle size-4 shrink-0" />

                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg-default truncate">
                    {label ?? t("unknownDevice")}
                    {device.current ? (
                      <span className="text-caption text-accent-text ml-2">
                        {t("currentDevice")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-caption text-fg-muted break-words">
                    {t("lastSeen", {
                      when: format.relativeTime(device.lastSeenAt),
                    })}
                    {device.ipAddress ? ` · ${device.ipAddress}` : ""}
                  </p>
                </div>

                {device.current ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() => handle(revokeDevice(device.id))}
                  >
                    {t("revoke")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {others.length > 0 ? <Button className="mt-3 max-w-full" size="sm" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
          {ui(showAll ? "hideDevices" : "showDevices", { count: devices.length })}
        </Button> : null}
        <div aria-live="polite" className="empty:hidden">
          {message ? <p className="text-caption text-fg-muted mt-3">{message}</p> : null}
        </div>

        {needsReauth ? <ReauthPrompt onDone={() => setNeedsReauth(false)} /> : null}

        {others.length > 0 ? (
          <div className="border-border mt-4 border-t pt-4">
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={() => handle(revokeAllOtherDevices())}
            >
              {t("revokeAll")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The re-auth window has lapsed; prove the password once and carry on. */
function ReauthPrompt({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await confirmPassword(previous, formData);
      if (result.ok) onDone();
      return result;
    },
    {},
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface-inset rounded-control mt-4 flex flex-col gap-3 border p-3"
    >
      <p className="text-label text-fg-default">{t("confirmToContinue")}</p>
      <PasswordField
        name="password"
        label={t("password")}
        autoComplete="current-password"
        error={state.error ? t(state.error) : undefined}
      />
      <Button type="submit" size="sm" variant="primary" loading={pending} className="w-fit">
        {t("confirm")}
      </Button>
    </form>
  );
}
