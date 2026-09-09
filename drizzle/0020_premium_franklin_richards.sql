CREATE TYPE "public"."channel_member_status" AS ENUM('active', 'pending', 'declined');--> statement-breakpoint
ALTER TYPE "public"."activity_subject" ADD VALUE 'channel';--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "status" "channel_member_status" DEFAULT 'active' NOT NULL;