CREATE TYPE "public"."document_kind" AS ENUM('brief', 'marketing_system', 'pre_production', 'case_study', 'playbook', 'reference', 'note');--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('onboarding', 'strategy', 'planning', 'production', 'review', 'client_validation', 'publishing', 'reporting');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'document';--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"kind" "document_kind" DEFAULT 'note' NOT NULL,
	"project_id" uuid,
	"department_id" uuid,
	"owner_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stage" "project_stage";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stage_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sops" ADD COLUMN "stage" "project_stage";--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_sections_document_idx" ON "document_sections" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_sections_org_idx" ON "document_sections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_slug_key" ON "documents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "documents_org_kind_idx" ON "documents" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "documents_org_project_idx" ON "documents" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "projects_org_stage_idx" ON "projects" USING btree ("organization_id","stage");--> statement-breakpoint
CREATE INDEX "sops_org_stage_idx" ON "sops" USING btree ("organization_id","stage");