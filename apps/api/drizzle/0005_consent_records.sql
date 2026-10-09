CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_account_idx" ON "consents" USING btree ("account_id");