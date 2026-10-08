CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_doors" (
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "event_doors_event_id_name_pk" PRIMARY KEY("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "event_views" (
	"event_id" text NOT NULL,
	"day" integer NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_views_event_id_day_pk" PRIMARY KEY("event_id","day")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizer_applications" (
	"organizer_id" text PRIMARY KEY NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"about" text NOT NULL,
	"applied_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"event_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payouts_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "rate_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"event_id" text,
	"requested_bps" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"organizer_id" text NOT NULL,
	"event_id" text,
	"old_bps" integer NOT NULL,
	"new_bps" integer NOT NULL,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "checkin_code" text;--> statement-breakpoint
-- Events made before door check-in get a random code, in the same form new events are given.
UPDATE "events" SET "checkin_code" = left(split_part("slug", '-', 1), 12) || '-' || substr(md5(random()::text || "id"), 1, 12);--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "checkin_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event_doors" ADD CONSTRAINT "event_doors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_views" ADD CONSTRAINT "event_views_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_approvals" ADD CONSTRAINT "rate_approvals_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_approvals" ADD CONSTRAINT "rate_approvals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payouts_organizer_idx" ON "payouts" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "rate_approvals_organizer_idx" ON "rate_approvals" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "rate_changes_organizer_idx" ON "rate_changes" USING btree ("organizer_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_checkin_code_unique" UNIQUE("checkin_code");