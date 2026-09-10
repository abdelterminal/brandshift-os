/**
 * The delivery-flow stage list, and the shapes the board renders.
 *
 * Split from `pipeline.ts` because that module is `server-only` (it queries),
 * and the pipeline board is a Client Component that needs the ordered stage
 * list and the card/column types. Nothing here touches a database.
 */

export const PROJECT_STAGES = [
  "onboarding",
  "strategy",
  "planning",
  "production",
  "review",
  "client_validation",
  "publishing",
  "reporting",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export function isProjectStage(value: unknown): value is ProjectStage {
  return typeof value === "string" && (PROJECT_STAGES as readonly string[]).includes(value);
}

export type PipelineCard = {
  id: string;
  key: string;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  stageChangedAt: Date | null;
  openCount: number;
  blockedCount: number;
  overdueCount: number;
};

export type PipelineColumn = { stage: ProjectStage; cards: PipelineCard[] };
