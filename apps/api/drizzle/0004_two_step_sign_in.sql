ALTER TABLE "accounts" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pending_totp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "totp_attempts" integer DEFAULT 0 NOT NULL;