CREATE TYPE "public"."deliverable_status" AS ENUM('producing', 'internal_review', 'with_client', 'revising', 'published', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'deliverable';--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" "project_stage",
	"title" text NOT NULL,
	"description" text,
	"status" "deliverable_status" DEFAULT 'producing' NOT NULL,
	"assignee_user_id" uuid,
	"client_feedback" text,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliverables_org_project_status_idx" ON "deliverables" USING btree ("organization_id","project_id","status");--> statement-breakpoint
CREATE INDEX "deliverables_org_assignee_status_idx" ON "deliverables" USING btree ("organization_id","assignee_user_id","status");