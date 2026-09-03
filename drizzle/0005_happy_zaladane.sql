CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('annual', 'sick', 'unpaid', 'parental', 'other');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'leave';--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"working_days" numeric(4, 1) NOT NULL,
	"reason" text,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "annual_leave_days" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_org_start_idx" ON "leave_requests" USING btree ("organization_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_user_start_idx" ON "leave_requests" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("organization_id","status");