ALTER TYPE "public"."activity_subject" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"decision" text NOT NULL,
	"owner_user_id" uuid,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"held_on" date,
	"facilitator_user_id" uuid,
	"highlights" text,
	"concerns" text,
	"snapshot" jsonb,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_review_id_weekly_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."weekly_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_facilitator_user_id_users_id_fk" FOREIGN KEY ("facilitator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_decisions_review_idx" ON "review_decisions" USING btree ("review_id","position");--> statement-breakpoint
CREATE INDEX "review_decisions_org_idx" ON "review_decisions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "review_decisions_owner_idx" ON "review_decisions" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reviews_org_week_key" ON "weekly_reviews" USING btree ("organization_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_reviews_org_published_idx" ON "weekly_reviews" USING btree ("organization_id","published_at");