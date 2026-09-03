"use client";

import { MoreHorizontal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { AvatarGroup, PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Textarea } from "@/components/ui/input";
import { focusRing, transition } from "@/components/ui/styles";
import { readChannel, removeMessage, sendMessage, updateMessage } from "@/lib/actions/channels";
import { cn } from "@/lib/utils";

/**
 * A channel, as one column you read from top to bottom.
 *
 * Talk and activity are interleaved rather than kept in separate tabs, because
 * they are the same conversation: "Elena completed a task" and "Elena: can we
 * push the deadline?" happened one after the other and explain each other.
 * Events render quieter than messages so the column still scans as a
 * conversation with context in it, not a log with chat mixed in.
 *
 * Everything live arrives as "something changed, refetch" over SSE. There is
 * no second client-side rendering path for a message, so what you see after an
 * update and what you see after a reload are produced by the same code.
 */

/** Serialisable shapes. Dates cross the server boundary as ISO strings. */
export type FeedItem =
  | {
      kind: "message";
      id: string;
      at: string;
      authorUserId: string;
      authorName: string | null;
      avatarUrl: string | null;
      body: string;
      editedAt: string | null;
      deletedAt: string | null;
    }
  | {
      kind: "event";
      id: string;
      at: string;
      verb: string;
      actorName: string | null;
      metadata: Record<string, unknown>;
    };

export type Presence = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

/** Consecutive messages from one person inside this window read as one turn. */
const GROUPING_WINDOW_MS = 5 * 60 * 1000;

export function Conversation({
  channelId,
  currentUserId,
  items,
  initialViewers,
  canPost,
}: {
  channelId: string;
  currentUserId: string;
  items: FeedItem[];
  initialViewers: Presence[];
  canPost: boolean;
}) {
  const t = useTranslations("Channels");
  const activity = useTranslations("Activity");
  const format = useFormatter();
  const router = useRouter();

  const [viewers, setViewers] = useState<Presence[]>(initialViewers);
  const bottom = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------
  // Live
  // ---------------------------------------------------------------------

  useEffect(() => {
    const source = new EventSource(`/api/channels/stream?channel=${channelId}`);

    source.addEventListener("change", () => router.refresh());
    source.addEventListener("presence", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          viewers: Presence[];
        };
        setViewers(data.viewers);
      } catch {
        // A malformed frame costs one presence update, not the connection.
      }
    });

    return () => source.close();
  }, [channelId, router]);

  /**
   * Read means "you got to the bottom", not "you opened it".
   *
   * A channel you opened and navigated away from without reaching the end has
   * not been read, and clearing the badge then would lose exactly the message
   * you were coming back for.
   */
  useEffect(() => {
    const sentinel = bottom.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void readChannel(channelId);
      },
      // Any part of it counts. The sentinel is the last thing on the page, so
      // once it is flush with the bottom edge a stricter threshold rounds to
      // zero intersection and the channel never marks itself read.
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [channelId, items.length]);

  /** New arrivals belong in view; that is the whole point of the newest one. */
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  /** `task.completed` -> `taskCompleted`; next-intl reads a dot as nesting. */
  const messageKey = (verb: string) =>
    verb
      .split(".")
      .map((part, index) => (index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
      .join("");

  const describeEvent = (verb: string, metadata: Record<string, unknown>) => {
    const values = metadata as Record<string, string | undefined>;
    try {
      return activity(messageKey(verb) as "taskCompleted", {
        title: values.title ?? "",
        status: values.status ?? "",
        to: values.to ?? "",
      });
    } catch {
      return activity("unknown");
    }
  };

  // You are always in the room you are looking at, so saying so is noise. The
  // row is about who *else* turned up.
  const others = viewers.filter((viewer) => viewer.userId !== currentUserId);

  const rows = collapseEventRuns(items);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {others.length > 0 ? (
        <div className="text-caption text-fg-muted flex items-center gap-2 pb-3">
          <AvatarGroup
            people={others.map((viewer) => ({
              name: viewer.name,
              src: viewer.avatarUrl,
            }))}
            max={5}
          />
          <span>{t("viewingNow", { count: others.length })}</span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="border-border rounded-card border">
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        </div>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((row, index) => {
            if (row.kind === "run") {
              return (
                <li key={row.id} className="flex items-baseline gap-2 py-1 pl-1">
                  <span aria-hidden className="bg-border-control size-1.5 shrink-0 rounded-pill" />
                  <p className="text-caption text-fg-muted min-w-0">
                    {t("collapsedUpdates", { count: row.count })}{" "}
                    <time dateTime={row.at} className="text-fg-subtle">
                      {format.relativeTime(new Date(row.at))}
                    </time>
                  </p>
                </li>
              );
            }

            const item = row;
            const previous = rows[index - 1];

            if (item.kind === "event") {
              return (
                <li key={item.id} className="flex items-baseline gap-2 py-1 pl-1">
                  <span aria-hidden className="bg-border-control size-1.5 shrink-0 rounded-pill" />
                  <p className="text-caption text-fg-muted min-w-0">
                    <span className="font-medium">{item.actorName ?? activity("system")}</span>{" "}
                    {describeEvent(item.verb, item.metadata)}{" "}
                    <time dateTime={item.at} className="text-fg-subtle">
                      {format.relativeTime(new Date(item.at))}
                    </time>
                  </p>
                </li>
              );
            }

            const grouped =
              previous?.kind === "message" &&
              previous.authorUserId === item.authorUserId &&
              new Date(item.at).getTime() - new Date(previous.at).getTime() < GROUPING_WINDOW_MS;

            return (
              <MessageRow
                key={item.id}
                item={item}
                grouped={grouped}
                mine={item.authorUserId === currentUserId}
              />
            );
          })}
        </ol>
      )}

      {canPost ? <Composer channelId={channelId} /> : null}

      {/*
        The read mark and the scroll target are the same point, and it sits
        below the composer: "you have reached the end" should mean the box you
        reply in is on screen too, not that it is one scroll further down.
      */}
      <div ref={bottom} aria-hidden className="h-6" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keeping it a conversation
// ---------------------------------------------------------------------------

/** A long run of events, folded into one line. */
type Run = { kind: "run"; id: string; at: string; count: number };

/** How many consecutive events it takes before they stop being context. */
const RUN_THRESHOLD = 4;

/**
 * Events that are never folded away.
 *
 * A blocker, a project changing status, somebody's role changing: these are
 * the events a person scrolling a channel is actually looking for, and they
 * are rare enough that keeping every one of them costs nothing. Assignments
 * and completions are the churn -- individually unremarkable, collectively a
 * wall.
 */
const ALWAYS_SHOWN = new Set([
  "project.created",
  "project.statusChanged",
  "task.blocked",
  "task.unblocked",
  "member.roleChanged",
]);

/**
 * Fold long runs of routine activity into a single line.
 *
 * Interleaving activity with talk is the point of this screen, but a project
 * that had fifteen tasks assigned in one afternoon opens with fifteen
 * near-identical lines and reads as a log rather than a conversation -- and
 * the messages, which are the thing you came for, are pushed off the bottom.
 *
 * A few events between messages are context and stay. A run of four or more
 * routine ones is folded to a count; the project's Activity tab still has
 * every one of them, and this channel links straight to it.
 */
function collapseEventRuns(items: FeedItem[]): Array<FeedItem | Run> {
  const rows: Array<FeedItem | Run> = [];
  let run: FeedItem[] = [];

  function flush(): void {
    if (run.length === 0) return;
    if (run.length < RUN_THRESHOLD) rows.push(...run);
    else
      rows.push({
        kind: "run",
        id: `run-${run[0]!.id}`,
        // The end of the run, because that is when this burst of work stopped.
        at: run.at(-1)!.at,
        count: run.length,
      });
    run = [];
  }

  for (const item of items) {
    if (item.kind === "event" && !ALWAYS_SHOWN.has(item.verb)) {
      run.push(item);
      continue;
    }
    flush();
    rows.push(item);
  }
  flush();

  return rows;
}

// ---------------------------------------------------------------------------
// One message
// ---------------------------------------------------------------------------

function MessageRow({
  item,
  grouped,
  mine,
}: {
  item: Extract<FeedItem, { kind: "message" }>;
  grouped: boolean;
  mine: boolean;
}) {
  const t = useTranslations("Channels");
  const format = useFormatter();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (item.deletedAt) {
    return <li className="text-caption text-fg-subtle py-1 pl-11 italic">{t("deleted")}</li>;
  }

  return (
    <li className={cn("group/message flex items-start gap-3", grouped ? "pt-0" : "pt-3")}>
      {grouped ? (
        <span aria-hidden className="w-8 shrink-0" />
      ) : (
        <PersonAvatar
          name={item.authorName ?? "?"}
          src={item.avatarUrl}
          size="md"
          className="mt-0.5"
        />
      )}

      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-label text-fg-default font-semibold">{item.authorName}</span>
            <time dateTime={item.at} className="text-caption text-fg-subtle">
              {format.relativeTime(new Date(item.at))}
            </time>
          </p>
        )}

        {editing ? (
          <form
            className="mt-1 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await updateMessage(item.id, draft);
                if (result.ok) {
                  setEditing(false);
                  router.refresh();
                }
              });
            }}
          >
            <Textarea
              aria-label={t("editLabel")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-16"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" loading={pending}>
                {t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDraft(item.body);
                  setEditing(false);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-body text-fg-default whitespace-pre-wrap break-words">
            {item.body}
            {item.editedAt ? (
              <span className="text-caption text-fg-subtle ml-1.5">{t("edited")}</span>
            ) : null}
          </p>
        )}
      </div>

      {mine && !editing ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label={t("messageActions")}
                className={cn(
                  "text-fg-subtle hover:text-fg-default hover:bg-surface-hover shrink-0 rounded-control p-1",
                  // Hidden until it is wanted, but never hidden from a
                  // keyboard: focus brings it back.
                  "opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100",
                  focusRing,
                  transition,
                )}
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            }
          />
          <MenuContent>
            <MenuItem onClick={() => setEditing(true)}>{t("edit")}</MenuItem>
            <MenuItem onClick={() => setConfirming(true)}>{t("delete")}</MenuItem>
          </MenuContent>
        </Menu>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button>{t("cancel")}</Button>} />
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeMessage(item.id);
                  setConfirming(false);
                  router.refresh();
                })
              }
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The box you type in
// ---------------------------------------------------------------------------

function Composer({ channelId }: { channelId: string }) {
  const t = useTranslations("Channels");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = useCallback(() => {
    const text = body.trim();
    if (!text || pending) return;

    // Cleared straight away rather than on success: the message is on its way,
    // and a box that stays full while it sends is a box people send twice.
    setBody("");
    startTransition(async () => {
      const result = await sendMessage(channelId, text);
      if (!result.ok) setBody(text);
      router.refresh();
    });
  }, [body, channelId, pending, router]);

  return (
    <form
      /*
       * The end of the column, not pinned to the viewport. A `sticky bottom-0`
       * composer inside a normally scrolling page covers the newest message --
       * the one thing it must never hide -- and on a phone it lands underneath
       * the bottom nav, where it cannot be reached at all. Pinning it properly
       * means the shell owning the scroll region rather than the document; see
       * KNOWN-GAPS.
       */
      className="border-border mt-4 flex items-end gap-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label={t("composerLabel")}
        placeholder={t("composerPlaceholder")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line. The other way round is
          // technically defensible and universally wrong in a chat box.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="min-h-11"
      />
      <Button type="submit" variant="primary" loading={pending} disabled={body.trim().length === 0}>
        {t("send")}
      </Button>
    </form>
  );
}
