CREATE TYPE "public"."meeting_response" AS ENUM('needs_action', 'accepted', 'declined', 'tentative');--> statement-breakpoint
CREATE TABLE "meeting_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "meeting_response" DEFAULT 'needs_action' NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"agenda" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"project_id" uuid,
	"organizer_user_id" uuid NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendees_meeting_user_key" ON "meeting_attendees" USING btree ("meeting_id","user_id");--> statement-breakpoint
CREATE INDEX "meeting_attendees_user_idx" ON "meeting_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_attendees_org_idx" ON "meeting_attendees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meetings_org_starts_idx" ON "meetings" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "meetings_project_starts_idx" ON "meetings" USING btree ("project_id","starts_at");