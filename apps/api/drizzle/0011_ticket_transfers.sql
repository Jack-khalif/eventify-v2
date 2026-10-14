ALTER TABLE "tickets" ADD COLUMN "holder_email" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "transferred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "transferred_from_id" text;--> statement-breakpoint
CREATE INDEX "tickets_holder_email_idx" ON "tickets" USING btree (lower("holder_email"));