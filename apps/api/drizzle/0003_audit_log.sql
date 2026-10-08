CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"detail" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");