ALTER TABLE "invoice_lines" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "exclusions" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD COLUMN "exclusions" text;