CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"blocked_task_id" uuid NOT NULL,
	"blocking_task_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"last_nudged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_blocked_task_id_tasks_id_fk" FOREIGN KEY ("blocked_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_blocking_task_id_tasks_id_fk" FOREIGN KEY ("blocking_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_links_pair_key" ON "task_links" USING btree ("blocked_task_id","blocking_task_id");--> statement-breakpoint
CREATE INDEX "task_links_blocked_idx" ON "task_links" USING btree ("blocked_task_id");--> statement-breakpoint
CREATE INDEX "task_links_blocking_idx" ON "task_links" USING btree ("blocking_task_id");--> statement-breakpoint
CREATE INDEX "task_links_org_idx" ON "task_links" USING btree ("organization_id");