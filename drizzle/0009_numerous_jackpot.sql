CREATE TYPE "public"."key_result_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."key_result_unit" AS ENUM('count', 'percent', 'currency', 'days');--> statement-breakpoint
CREATE TYPE "public"."objective_outcome" AS ENUM('achieved', 'partly', 'missed', 'abandoned');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'objective';--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'key_result';--> statement-breakpoint
CREATE TABLE "key_result_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key_result_id" uuid NOT NULL,
	"value" bigint NOT NULL,
	"recorded_on" date NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"unit" "key_result_unit" NOT NULL,
	"direction" "key_result_direction" DEFAULT 'increase' NOT NULL,
	"start_value" bigint NOT NULL,
	"target_value" bigint NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"owner_user_id" uuid,
	"department_id" uuid,
	"outcome" "objective_outcome",
	"closing_note" text,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "key_result_checkpoints" ADD CONSTRAINT "key_result_checkpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_result_checkpoints" ADD CONSTRAINT "key_result_checkpoints_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_result_checkpoints" ADD CONSTRAINT "key_result_checkpoints_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "key_result_checkpoints_kr_idx" ON "key_result_checkpoints" USING btree ("key_result_id","recorded_on");--> statement-breakpoint
CREATE INDEX "key_result_checkpoints_org_idx" ON "key_result_checkpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "key_results_objective_idx" ON "key_results" USING btree ("objective_id","position");--> statement-breakpoint
CREATE INDEX "key_results_org_idx" ON "key_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "objectives_org_period_idx" ON "objectives" USING btree ("organization_id","period_end");--> statement-breakpoint
CREATE INDEX "objectives_org_owner_idx" ON "objectives" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "objectives_org_department_idx" ON "objectives" USING btree ("organization_id","department_id");