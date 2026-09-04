CREATE TYPE "public"."sop_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'sop';--> statement-breakpoint
CREATE TABLE "sop_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sop_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" "sop_status" DEFAULT 'draft' NOT NULL,
	"department_id" uuid,
	"owner_user_id" uuid,
	"review_interval_days" integer DEFAULT 180 NOT NULL,
	"last_reviewed_on" date,
	"last_reviewed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sop_steps" ADD CONSTRAINT "sop_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_steps" ADD CONSTRAINT "sop_steps_sop_id_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."sops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_last_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("last_reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sop_steps_sop_idx" ON "sop_steps" USING btree ("sop_id","position");--> statement-breakpoint
CREATE INDEX "sop_steps_org_idx" ON "sop_steps" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sops_org_slug_key" ON "sops" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "sops_org_status_idx" ON "sops" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "sops_org_department_idx" ON "sops" USING btree ("organization_id","department_id");--> statement-breakpoint
CREATE INDEX "sops_org_reviewed_idx" ON "sops" USING btree ("organization_id","last_reviewed_on");