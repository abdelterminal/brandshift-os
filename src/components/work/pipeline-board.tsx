"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonAvatar } from "@/components/ui/avatar";
import { Badge, CountBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { focusRing, transition } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import { setProjectStageAction } from "@/lib/actions/pipeline";
import { PROJECT_STAGES, type PipelineColumn, type ProjectStage } from "@/lib/data/pipeline-stages";
import { cn } from "@/lib/utils";

/**
 * The pipeline board.
 *
 * One drop is one stage change -- there is no batching and no Save, because a
 * project sits in exactly one stage and moving it is a single fact, unlike the
 * task board where a drag can reorder a whole column. Every drag has a
 * pointer-free equal: the two chevrons on each card step it to the neighbouring
 * stage, which is what keeps this reachable from the keyboard.
 */

export type PipelineBoardProps = {
  columns: PipelineColumn[];
  /** Per project id: may the current viewer move it? Computed on the server. */
  canMove: Record<string, boolean>;
};

export function PipelineBoard({ columns, canMove }: PipelineBoardProps) {
  const t = useTranslations("Pipeline");
  const stageLabels = useTranslations("ProjectStage");
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);
  if (total === 0) {
    return (
      <div className="border-border rounded-card border">
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      </div>
    );
  }

  function move(projectId: string, to: ProjectStage) {
    if (!canMove[projectId]) {
      toast.add({ title: t("moveForbidden"), data: { tone: "attention" } });
      return;
    }
    setMovingId(projectId);
    startTransition(async () => {
      const result = await setProjectStageAction({ projectId, stage: to });
      setMovingId(null);
      if (!result.ok) {
        if (result.error === "alreadyThere") return;
        toast.add({
          title: result.error === "forbidden" ? t("moveForbidden") : t("moved", { stage: stageLabels(to) }),
          data: { tone: "attention" },
        });
        return;
      }
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const projectId = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!over || !isStage(over)) return;
    const from = findStage(columns, projectId);
    if (from === over) return;
    move(projectId, over);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => (
          <Column
            key={column.stage}
            column={column}
            label={stageLabels(column.stage)}
            emptyLabel={t("columnEmpty")}
          >
            {column.cards.map((card) => {
              const index = PROJECT_STAGES.indexOf(column.stage);
              return (
                <Card
                  key={card.id}
                  card={card}
                  disabled={pending || !canMove[card.id]}
                  busy={movingId === card.id}
                  prevStage={index > 0 ? PROJECT_STAGES[index - 1]! : null}
                  nextStage={
                    index < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[index + 1]! : null
                  }
                  stageLabels={stageLabels}
                  onStep={(to) => move(card.id, to)}
                />
              );
            })}
          </Column>
        ))}
      </div>
    </DndContext>
  );
}

function isStage(value: string): value is ProjectStage {
  return (PROJECT_STAGES as readonly string[]).includes(value);
}

function findStage(columns: PipelineColumn[], projectId: string): ProjectStage | null {
  for (const column of columns) {
    if (column.cards.some((card) => card.id === projectId)) return column.stage;
  }
  return null;
}

function Column({
  column,
  label,
  emptyLabel,
  children,
}: {
  column: PipelineColumn;
  label: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "border-border bg-surface-raised rounded-card border p-3",
        transition,
        isOver && "border-accent-border bg-surface-active",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-label text-fg-default font-medium">{label}</h2>
        <CountBadge tone={column.cards.length > 0 ? "neutral" : "neutral"}>
          {column.cards.length}
        </CountBadge>
      </div>
      <div className="flex flex-col gap-2">
        {column.cards.length === 0 ? (
          <p className="text-caption text-fg-subtle px-1 py-6 text-center">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Card({
  card,
  disabled,
  busy,
  prevStage,
  nextStage,
  stageLabels,
  onStep,
}: {
  card: PipelineColumn["cards"][number];
  disabled: boolean;
  busy: boolean;
  prevStage: ProjectStage | null;
  nextStage: ProjectStage | null;
  stageLabels: (key: ProjectStage) => string;
  onStep: (to: ProjectStage) => void;
}) {
  const t = useTranslations("Pipeline");
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });

  return (
    <article
      ref={setNodeRef}
      className={cn(
        "border-border bg-surface-default rounded-control border p-2.5",
        transition,
        isDragging && "opacity-40",
        busy && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn(
            "text-caption text-fg-subtle mt-0.5 shrink-0 cursor-grab tabular-nums",
            focusRing,
            disabled && "cursor-not-allowed",
          )}
          aria-label={t("inStageFor", { label: "" })}
          {...listeners}
          {...attributes}
        >
          {card.key}
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/work/${card.key}`}
            className={cn("text-body text-fg-default hover:underline", focusRing)}
          >
            {card.name}
          </Link>
          <div className="text-caption text-fg-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {card.ownerName ? (
              <span className="inline-flex items-center gap-1">
                <PersonAvatar name={card.ownerName} size="xs" />
                {card.ownerName}
              </span>
            ) : null}
            {card.stageChangedAt ? (
              <span>{t("inStageFor", { label: format.relativeTime(card.stageChangedAt) })}</span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {card.openCount > 0 ? (
              <Badge tone="neutral" size="sm">
                {t("openTasks", { count: card.openCount })}
              </Badge>
            ) : null}
            {card.blockedCount > 0 ? (
              <Badge tone="blocked" size="sm">
                {t("blockedCount", { count: card.blockedCount })}
              </Badge>
            ) : null}
            {card.overdueCount > 0 ? (
              <Badge tone="attention" size="sm">
                {t("overdueCount", { count: card.overdueCount })}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            disabled={disabled || !prevStage}
            onClick={() => prevStage && onStep(prevStage)}
            aria-label={prevStage ? stageLabels(prevStage) : undefined}
            className={cn(
              "text-fg-muted hover:text-fg-default rounded-control p-0.5 disabled:opacity-30",
              focusRing,
              transition,
            )}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled || !nextStage}
            onClick={() => nextStage && onStep(nextStage)}
            aria-label={nextStage ? stageLabels(nextStage) : undefined}
            className={cn(
              "text-fg-muted hover:text-fg-default rounded-control p-0.5 disabled:opacity-30",
              focusRing,
              transition,
            )}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}
