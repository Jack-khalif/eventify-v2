CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"city" text NOT NULL,
	"currency" text NOT NULL,
	"venue" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"map_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"description" jsonb NOT NULL,
	"cover_tone" text NOT NULL,
	"cover_image_url" text,
	"organizer_id" text NOT NULL,
	"status" text NOT NULL,
	"rate_bps" integer,
	"ticket_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"tier_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"buyer_email" text NOT NULL,
	"payment_method" text,
	"status" text NOT NULL,
	"failure_reason" text,
	"payment_requested_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone NOT NULL,
	"rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_attempts" integer DEFAULT 0 NOT NULL,
	"email_attempt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"banner_tone" text NOT NULL,
	"city" text NOT NULL,
	"category" text NOT NULL,
	"agent_id" text,
	"rate_bps" integer NOT NULL,
	"status" text NOT NULL,
	"payout_method" text NOT NULL,
	CONSTRAINT "organizers_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"order_id" text NOT NULL,
	"event_id" text NOT NULL,
	"index" integer NOT NULL,
	"holder_name" text NOT NULL,
	"secret" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_door" text,
	CONSTRAINT "tickets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"price_minor" integer NOT NULL,
	"quantity" integer,
	"sold" integer DEFAULT 0 NOT NULL,
	"sale_starts_at" timestamp with time zone,
	"sale_ends_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_organizer_idx" ON "events" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "orders_tier_idx" ON "orders" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "orders_phone_idx" ON "orders" USING btree ("buyer_phone");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_event_idx" ON "tickets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tiers_event_idx" ON "tiers" USING btree ("event_id");