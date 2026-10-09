ALTER TABLE "accounts" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
-- Every account so far was made by entering an emailed code.
UPDATE "accounts" SET "email_verified_at" = "created_at";
