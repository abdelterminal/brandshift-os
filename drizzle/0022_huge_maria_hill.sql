CREATE TABLE "project_stage_setup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" "project_stage" NOT NULL,
	"task_count" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"set_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_up_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stage_playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stage" "project_stage" NOT NULL,
	"template_id" uuid,
	"expected_doc_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_stage_setup" ADD CONSTRAINT "project_stage_setup_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_setup" ADD CONSTRAINT "project_stage_setup_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_setup" ADD CONSTRAINT "project_stage_setup_set_up_by_user_id_users_id_fk" FOREIGN KEY ("set_up_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_playbook" ADD CONSTRAINT "stage_playbook_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_playbook" ADD CONSTRAINT "stage_playbook_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_playbook" ADD CONSTRAINT "stage_playbook_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_setup_project_stage_key" ON "project_stage_setup" USING btree ("project_id","stage");--> statement-breakpoint
CREATE INDEX "project_stage_setup_org_idx" ON "project_stage_setup" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_playbook_org_stage_key" ON "stage_playbook" USING btree ("organization_id","stage");