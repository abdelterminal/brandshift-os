ALTER TABLE "organizations" ALTER COLUMN "currency" SET DEFAULT 'MAD';--> statement-breakpoint
-- Nothing has ever let an organization choose its own currency yet -- every
-- row still standing on 'EUR' got there from this same default, not a real
-- choice, so backfilling them is safe. A currency set on purpose from here on
-- is untouched.
UPDATE "organizations" SET "currency" = 'MAD' WHERE "currency" = 'EUR';