import type {
  Category,
  City,
  CoverTone,
  Currency,
  EventStatus,
  OrderStatus,
  OrganizerStatus,
  PaymentFailure,
  PaymentMethod,
  PayoutMethod,
  Role,
} from '@eventify/shared';
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Enum-like columns are text typed from the shared schemas, so adding a value needs no migration. */
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const organizers = pgTable('organizers', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  verified: boolean('verified').notNull().default(false),
  bio: text('bio').notNull().default(''),
  bannerTone: text('banner_tone').$type<CoverTone>().notNull(),
  city: text('city').$type<City>().notNull(),
  category: text('category').$type<Category>().notNull(),
  agentId: text('agent_id'),
  rateBps: integer('rate_bps').notNull(),
  status: text('status').$type<OrganizerStatus>().notNull(),
  payoutMethod: text('payout_method').$type<PayoutMethod>().notNull(),
});

/** A person who can sign in. One email address (stored in lower case), one account. */
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  /** Empty until they tell us (the organizer application asks). */
  name: text('name').notNull().default(''),
  role: text('role').$type<Role>().notNull(),
  organizerId: text('organizer_id').references(() => organizers.id),
  agentId: text('agent_id'),
  createdAt: instant('created_at').notNull().defaultNow(),
});

/** Open sign-ins. Only a hash of the token is kept, so a copy of this table can't be used to sign in. */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [index('sessions_account_idx').on(t.accountId)],
);

/** The one-time sign-in code last emailed to an address; a new one replaces it. */
export const loginCodes = pgTable('login_codes', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: instant('expires_at').notNull(),
  /** Wrong guesses so far; the code stops working after a few. */
  attempts: integer('attempts').notNull().default(0),
  sentAt: instant('sent_at').notNull(),
  /** Codes sent since hourStartedAt, to cap how many emails one address can be sent. */
  sentThisHour: integer('sent_this_hour').notNull().default(1),
  hourStartedAt: instant('hour_started_at').notNull(),
});

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    category: text('category').$type<Category>().notNull(),
    city: text('city').$type<City>().notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    venue: text('venue').notNull(),
    address: text('address').notNull().default(''),
    mapUrl: text('map_url'),
    startsAt: instant('starts_at').notNull(),
    endsAt: instant('ends_at').notNull(),
    description: jsonb('description').$type<string[]>().notNull(),
    coverTone: text('cover_tone').$type<CoverTone>().notNull(),
    coverImageUrl: text('cover_image_url'),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id),
    status: text('status').$type<EventStatus>().notNull(),
    /** This event's own fee rate; null = the organizer's rate. */
    rateBps: integer('rate_bps'),
    /** Last ticket number issued, for codes like EVT-SAUTI-0412. */
    ticketSeq: integer('ticket_seq').notNull().default(0),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [index('events_organizer_idx').on(t.organizerId)],
);

export const tiers = pgTable(
  'tiers',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    /** Order on the event page. */
    position: integer('position').notNull(),
    name: text('name').notNull(),
    note: text('note').notNull().default(''),
    priceMinor: integer('price_minor').notNull(),
    /** null = no cap. */
    quantity: integer('quantity'),
    /** Tickets paid for. Tickets held by unpaid orders are counted from the orders table. */
    sold: integer('sold').notNull().default(0),
    saleStartsAt: instant('sale_starts_at'),
    saleEndsAt: instant('sale_ends_at'),
  },
  (t) => [index('tiers_event_idx').on(t.eventId)],
);

export const orders = pgTable(
  'orders',
  {
    /** Long and random: the order link is all a guest buyer has, so it must be unguessable. */
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    tierId: text('tier_id')
      .notNull()
      .references(() => tiers.id),
    quantity: integer('quantity').notNull(),
    totalMinor: integer('total_minor').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    buyerName: text('buyer_name').notNull(),
    buyerPhone: text('buyer_phone').notNull(),
    buyerEmail: text('buyer_email').notNull(),
    paymentMethod: text('payment_method').$type<PaymentMethod>(),
    status: text('status').$type<OrderStatus>().notNull(),
    failureReason: text('failure_reason').$type<PaymentFailure>(),
    paymentRequestedAt: instant('payment_requested_at'),
    holdExpiresAt: instant('hold_expires_at').notNull(),
    rateBps: integer('rate_bps').notNull(),
    createdAt: instant('created_at').notNull(),
    paidAt: instant('paid_at'),
    /** Ticket email: set once it has gone out; attempts are counted so a failing send stops retrying. */
    emailSentAt: instant('email_sent_at'),
    emailAttempts: integer('email_attempts').notNull().default(0),
    emailAttemptAt: instant('email_attempt_at'),
  },
  (t) => [index('orders_tier_idx').on(t.tierId), index('orders_phone_idx').on(t.buyerPhone)],
);

export const tickets = pgTable(
  'tickets',
  {
    /** Long and random: the /t/{id} link works like the ticket itself. */
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    /** 1-based position in the order. */
    index: integer('index').notNull(),
    holderName: text('holder_name').notNull(),
    /** Seeds the rotating live code. */
    secret: text('secret').notNull(),
    checkedInAt: instant('checked_in_at'),
    checkedInDoor: text('checked_in_door'),
  },
  (t) => [index('tickets_order_idx').on(t.orderId), index('tickets_event_idx').on(t.eventId)],
);
