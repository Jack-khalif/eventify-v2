ALTER TABLE "payment_attempts" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "payment_url" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "refund_status" text;