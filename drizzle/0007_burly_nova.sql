ALTER TABLE "channels" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_deal_key" ON "channels" USING btree ("deal_id") WHERE "channels"."deal_id" is not null;