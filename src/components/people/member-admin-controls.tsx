"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ReauthPrompt } from "@/components/auth/reauth-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  changeMemberEmail,
  resetMemberPassword,
  setMemberSuspended,
  updateMemberProfile,
  type PeopleResult,
} from "@/lib/actions/people";
import { sendPasswordReset } from "@/lib/actions/reset";

/**
 * The admin-side controls on somebody else's page: fix their details, move
 * their sign-in address, take their access away or give it back.
 *
 * Three separate cards rather than one form, because they carry three very
 * different weights. Correcting a job title is clerical; moving an email
 * address hands over the account. Putting them in one `Save` would make the
 * dangerous act look exactly as routine as the harmless one.
 *
 * Each card is rendered only when `can()` passed on the server -- see
 * `PersonPage` -- so a visible control and a permitted action are deciding on
 * the same rule in `authz.ts`, and never disagree.
 *
 * Two shapes are shared with the rest of the app on purpose:
 *
 * - **Confirm in place**, as `ProjectStatusControl` and `ArchiveCompanyControl`
 *   do. Suspending and moving an address both ask once, inline. This page is
 *   already a page; a dialog here would be the stacked-modal shape the design
 *   rules refuse.
 * - **`ReauthPrompt` after the refusal, never before it.** The two sensitive
 *   actions call `requireRecentAuth()` server-side and come back
 *   `reauthRequired`; only then does the password field appear, and the act is
 *   retried once it clears. Asking up front is what trained people at the old
 *   app to type their password without reading the dialog.
 */

/** The error strings these three actions can return, as `People` message keys. */
type MemberError =
  | "onlyOwnerCanEditOwner"
  | "lastOwner"
  | "cannotSuspendSelf"
  | "emailTaken"
  | "notFound"
  | "invalid";

/**
 * Runs one of the three actions and sorts the outcome into "ask for the
 * password", "show an error" or "done".
 *
 * Shared by all three cards so the re-auth handshake behaves identically
 * everywhere: the attempt is remembered, the prompt is shown, and clearing it
 * replays exactly what was already asked for rather than making the person set
 * the form up a second time.
 */
function useMemberAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<MemberError | null>(null);
  const [done, setDone] = useState(false);
  /** The attempt that was refused for re-auth, replayed once it clears. */
  const [retry, setRetry] = useState<(() => Promise<PeopleResult>) | null>(null);

  function run(action: () => Promise<PeopleResult>, after?: () => void) {
    setError(null);
    setDone(false);

    startTransition(async () => {
      const result = await action();

      if (!result.ok && result.error === "reauthRequired") {
        // Hold on to the attempt itself, not the values behind it: once the
        // password clears we re-run the same closure.
        setRetry(() => action);
        return;
      }

      setRetry(null);
      if (!result.ok) {
        setError(result.error as MemberError);
        return;
      }

      setDone(true);
      after?.();
      router.refresh();
    });
  }

  return {
    pending,
    error,
    done,
    needsReauth: retry !== null,
    run,
    /** Password accepted -- replay the attempt that was refused. */
    onReauthDone: () => {
      const action = retry;
      setRetry(null);
      if (action) run(action);
    },
    reset: () => {
      setError(null);
      setDone(false);
      setRetry(null);
    },
  };
}

/** The shared error/success line, announced rather than only coloured. */
function Feedback({
  error,
  done,
  doneLabel,
}: {
  error: MemberError | null;
  done: boolean;
  doneLabel: string;
}) {
  const t = useTranslations("People");

  return (
    <div aria-live="polite" className="empty:hidden">
      {error ? (
        <p className="text-body text-blocked-text">{t(error)}</p>
      ) : done ? (
        <p className="text-body text-complete-text">{doneLabel}</p>
      ) : null}
    </div>
  );
}

/**
 * Name and job title. No password prompt -- this is the routine write
 * CLAUDE.md explicitly keeps re-auth away from.
 */
export function EditMemberProfileCard({
  person,
}: {
  person: { userId: string; name: string; jobTitle: string | null };
}) {
  const t = useTranslations("People");
  const action = useMemberAction();

  const [name, setName] = useState(person.name);
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");

  const unchanged = name.trim() === person.name && jobTitle.trim() === (person.jobTitle ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("editProfile")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-body text-fg-muted max-w-md">{t("editProfileBody")}</p>

        <form
          className="mt-4 flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            action.run(() =>
              updateMemberProfile({
                userId: person.userId,
                name: name.trim(),
                jobTitle: jobTitle.trim() || undefined,
              }),
            );
          }}
        >
          {/*
            No `id`/`htmlFor` on a Field + Input pair: Base UI generates the id
            and wires the label's `for` to it. Passing our own gets the input's
            overwritten while the label keeps ours, which leaves a `for`
            pointing at nothing -- a label that is not a label. Raw `<select>`
            elements elsewhere do need the explicit pair, because Base UI has
            nothing to wire there.
          */}
          <Field>
            <FieldLabel>{t("name")}</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </Field>

          <Field>
            <FieldLabel>{t("jobTitle")}</FieldLabel>
            <Input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              maxLength={120}
            />
          </Field>

          <Feedback error={action.error} done={action.done} doneLabel={t("saved")} />

          <Button
            type="submit"
            variant="primary"
            loading={action.pending}
            disabled={unchanged || name.trim().length < 2}
            className="w-fit"
          >
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The sign-in address.
 *
 * Confirms in place before it writes, because this is the single act in the
 * app that hands somebody else's account over: it rewrites the credential and
 * the password-reset destination in one go. The server asks for the admin's own
 * password on top of that, revokes every session the target holds, and tells
 * them in the app -- see `changeMemberEmail`.
 */
export function ChangeMemberEmailCard({
  person,
}: {
  person: { userId: string; name: string; email: string };
}) {
  const t = useTranslations("People");
  const action = useMemberAction();

  const [email, setEmail] = useState(person.email);
  const [confirming, setConfirming] = useState(false);

  const next = email.trim().toLowerCase();
  const changed = next.length > 0 && next !== person.email.toLowerCase();

  function submit() {
    action.run(
      () => changeMemberEmail({ userId: person.userId, email: next }),
      () => setConfirming(false),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("changeEmail")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-body text-fg-muted max-w-md">{t("changeEmailBody")}</p>

        <form
          className="mt-4 flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!changed) return;
            if (!confirming) {
              action.reset();
              setConfirming(true);
              return;
            }
            submit();
          }}
        >
          <Field>
            <FieldLabel>{t("email")}</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setConfirming(false);
              }}
              required
              autoComplete="off"
            />
          </Field>

          <Feedback error={action.error} done={action.done} doneLabel={t("emailChanged")} />

          {confirming ? (
            <div className="border-border bg-surface-inset rounded-control flex flex-col gap-3 border p-3">
              <p className="text-body text-fg-default">
                {t("changeEmailConfirm", { name: person.name, email: next })}
              </p>
              <p className="text-caption text-fg-muted">{t("changeEmailConfirmNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" variant="destructive" loading={action.pending}>
                  {t("changeEmailConfirmButton")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={action.pending}
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="submit" variant="primary" disabled={!changed} className="w-fit">
              {t("changeEmail")}
            </Button>
          )}
        </form>

        {action.needsReauth ? <ReauthPrompt onDone={action.onReauthDone} /> : null}
      </CardContent>
    </Card>
  );
}

/**
 * Giving somebody a new password, for when they have lost theirs.
 *
 * The flow this is shaped around is the one that actually happens: they tell
 * an admin outside the app -- phone, desk, WhatsApp -- and the admin sets them
 * a new one and reads it back. So the password is the product of this card,
 * shown once, with a copy button, and never fetched again.
 *
 * The link route is kept underneath rather than replaced, because it is the
 * better answer whenever the person *can* be reached by message: it never puts
 * a working password in a second pair of hands.
 *
 * Not self-service in disguise -- see `resetMemberPassword` for why this gives
 * an admin nothing the Outbox already gave them, and for what is deliberately
 * missing (a forced change at next sign-in).
 */
export function ResetMemberPasswordCard({
  person,
  maySendLink,
}: {
  person: { userId: string; name: string };
  /** `member.editRole`, which is what `sendPasswordReset` checks. */
  maySendLink: boolean;
}) {
  const t = useTranslations("People");
  const router = useRouter();

  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<MemberError | "cannotResetSelf" | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  /** The one copy there will ever be. Held in state, never re-fetched. */
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [linkPending, startLinkTransition] = useTransition();
  const [linkSent, setLinkSent] = useState(false);

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetMemberPassword({ userId: person.userId });

      if (!result.ok && result.error === "reauthRequired") {
        setNeedsReauth(true);
        return;
      }

      setNeedsReauth(false);
      if (!result.ok) {
        setError(result.error as MemberError);
        setConfirming(false);
        return;
      }

      setPassword(result.password);
      setConfirming(false);
      setCopied(false);
      router.refresh();
    });
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright (insecure context, or a
      // permission prompt declined). The password is on screen and
      // selectable, so there is nothing to recover from -- only the
      // confirmation to withhold, rather than claim a copy that never
      // happened.
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resetPassword")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-body text-fg-muted max-w-md">{t("resetPasswordBody")}</p>

        <div className="mt-4 flex max-w-md flex-col gap-4">
          {password ? (
            <div className="border-border bg-surface-inset rounded-control flex flex-col gap-2 border p-3">
              <p className="text-label text-fg-default">{t("tempPassword")}</p>
              {/*
                `select-all` so one click takes the whole thing: this gets read
                aloud or pasted, and a half-selected password is worse than
                none. Tabular figures keep the groups aligned.
              */}
              <code className="text-body text-fg-default bg-surface-raised border-border rounded-control select-all border px-3 py-2 font-mono tracking-wide tabular-nums">
                {password}
              </code>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={copy}>
                  {t("copy")}
                </Button>
                <span aria-live="polite" className="text-caption text-complete-text empty:hidden">
                  {copied ? t("copied") : ""}
                </span>
              </div>
              <p className="text-caption text-fg-muted">{t("tempPasswordNote")}</p>
            </div>
          ) : null}

          <div aria-live="polite" className="empty:hidden">
            {error ? <p className="text-body text-blocked-text">{t(error)}</p> : null}
          </div>

          {confirming ? (
            <div className="border-border bg-surface-inset rounded-control flex flex-col gap-3 border p-3">
              <p className="text-body text-fg-default">
                {t("resetPasswordConfirm", { name: person.name })}
              </p>
              <p className="text-caption text-fg-muted">{t("resetPasswordConfirmNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" loading={pending} onClick={reset}>
                  {t("resetPasswordConfirmButton")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-fit"
              onClick={() => {
                setError(null);
                setPassword(null);
                setConfirming(true);
              }}
            >
              {password ? t("resetPasswordAgain") : t("resetPassword")}
            </Button>
          )}

          {needsReauth ? <ReauthPrompt onDone={reset} /> : null}

          {maySendLink ? (
            <div className="border-border flex flex-col gap-2 border-t pt-4">
              <p className="text-caption text-fg-muted">{t("sendResetLinkInstead")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  loading={linkPending}
                  onClick={() =>
                    startLinkTransition(async () => {
                      await sendPasswordReset(person.userId);
                      setLinkSent(true);
                    })
                  }
                  className="w-fit"
                >
                  {t("sendResetLink")}
                </Button>
                {/*
                  `role="status"` rather than a bare `aria-live` span, as the
                  card this replaced had: it is the one confirmation here that
                  reports an action completing rather than a UI nicety, so it
                  earns the role (and its implicit polite announcement). The
                  copy-button feedback above stays a plain live region, which
                  also keeps exactly one `status` in this card for anything
                  looking for it.
                */}
                <span role="status" className="text-caption text-complete-text empty:hidden">
                  {linkSent ? t("resetLinkSent") : ""}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Taking access away, and giving it back.
 *
 * Suspending asks first; reinstating does not, the same asymmetry
 * `ArchiveCompanyControl` uses -- one of the two only ever puts something back.
 * Deliberately not a delete: this person authored tasks, comments and activity,
 * and removing the row would either destroy that history or orphan it.
 */
export function SuspendMemberCard({
  person,
}: {
  person: { userId: string; name: string; suspended: boolean };
}) {
  const t = useTranslations("People");
  const action = useMemberAction();
  const [confirming, setConfirming] = useState(false);

  function apply(suspended: boolean) {
    action.run(
      () => setMemberSuspended({ userId: person.userId, suspended }),
      () => setConfirming(false),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{person.suspended ? t("reinstate") : t("suspend")}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <p className="text-body text-fg-muted max-w-md">
          {person.suspended ? t("reinstateBody") : t("suspendBody")}
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <Feedback
            error={action.error}
            done={action.done}
            doneLabel={person.suspended ? t("suspended") : t("reinstated")}
          />

          {person.suspended ? (
            <Button
              variant="primary"
              loading={action.pending}
              onClick={() => apply(false)}
              className="w-fit"
            >
              {t("reinstate")}
            </Button>
          ) : confirming ? (
            <div className="border-border bg-surface-inset rounded-control flex flex-col gap-3 border p-3">
              <p className="text-body text-fg-default">
                {t("suspendConfirm", { name: person.name })}
              </p>
              <p className="text-caption text-fg-muted">{t("suspendConfirmNote")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  loading={action.pending}
                  onClick={() => apply(true)}
                >
                  {t("suspendConfirmButton")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.pending}
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => {
                action.reset();
                setConfirming(true);
              }}
              className="w-fit"
            >
              {t("suspend")}
            </Button>
          )}
        </div>

        {action.needsReauth ? <ReauthPrompt onDone={action.onReauthDone} /> : null}
      </CardContent>
    </Card>
  );
}
