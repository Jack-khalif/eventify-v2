CREATE TABLE "merch_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"event_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"branding_notes" text NOT NULL,
	"requested_by_email" text NOT NULL,
	"status" text NOT NULL,
	"ops_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merch_requests" ADD CONSTRAINT "merch_requests_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merch_requests" ADD CONSTRAINT "merch_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merch_requests_event_idx" ON "merch_requests" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "merch_requests_status_idx" ON "merch_requests" USING btree ("status");