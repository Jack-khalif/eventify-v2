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
  PayoutStatus,
  Role,
} from '@eventify/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Enum-like columns are text typed from the shared schemas, so adding a value needs no migration. */
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Eventify staff who onboard organizers and look after their rates. */
export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

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
  /** The rate charged on new sales. Every change is also written to rate_changes. */
  rateBps: integer('rate_bps').notNull(),
  status: text('status').$type<OrganizerStatus>().notNull(),
  payoutMethod: text('payout_method').$type<PayoutMethod>().notNull(),
});

/** What an applicant told us, kept for the Super Admin who reviews it. Applying again replaces it. */
export const organizerApplications = pgTable('organizer_applications', {
  organizerId: text('organizer_id')
    .primaryKey()
    .references(() => organizers.id),
  contactName: text('contact_name').notNull(),
  email: text('email').notNull(),
  about: text('about').notNull(),
  appliedAt: instant('applied_at').notNull(),
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
  /** Two-step sign-in: the authenticator app's secret (base32), in use once totpEnabledAt is set. */
  totpSecret: text('totp_secret'),
  totpEnabledAt: instant('totp_enabled_at'),
  /** The 30-second step of the last code accepted, so a code can't be used twice. */
  totpLastStep: integer('totp_last_step'),
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
    /** The emailed code was right but the authenticator code is still owed; not a sign-in yet. */
    pendingTotp: boolean('pending_totp').notNull().default(false),
    /** Wrong authenticator codes so far; the pending sign-in is dropped after a few. */
    totpAttempts: integer('totp_attempts').notNull().default(0),
  },
  (t) => [index('sessions_account_idx').on(t.accountId)],
);

/**
 * The one-time code last sent to an address; a new one replaces it. The address is an email for
 * sign-in, or a phone number (+254…) for "Find my tickets".
 */
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
    /** Door staff open /checkin/{code}. The link is their only credential, so it is long and random. */
    checkinCode: text('checkin_code').notNull().unique(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [index('events_organizer_idx').on(t.organizerId)],
);

/** Door names devices have picked for an event, offered to the next device. */
export const eventDoors = pgTable(
  'event_doors',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.name] })],
);

/** Event page views per day, for the organizer dashboard. */
export const eventViews = pgTable(
  'event_views',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    /** Days since 1970 in EAT (see eatDay). */
    day: integer('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.day] })],
);

/** Posters organizers upload, served from /api/images/{id}. */
export const images = pgTable('images', {
  /** Random, so it can be cached for ever. */
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(),
  /** Base64. */
  data: text('data').notNull(),
  createdAt: instant('created_at').notNull(),
});

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

/** Every payment prompt sent for an order (a retry is a new one), for the admin overview. */
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    requestedAt: instant('requested_at').notNull(),
    /** null while the buyer hasn't answered (or never did before the hold ran out). */
    outcome: text('outcome').$type<'paid' | PaymentFailure>(),
    resolvedAt: instant('resolved_at'),
  },
  (t) => [index('payment_attempts_order_idx').on(t.orderId)],
);

/** Every fee rate change, newest shown first in the admin portal. */
export const rateChanges = pgTable(
  'rate_changes',
  {
    id: text('id').primaryKey(),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id),
    /** Set when the change applies to one event only. */
    eventId: text('event_id').references(() => events.id),
    oldBps: integer('old_bps').notNull(),
    newBps: integer('new_bps').notNull(),
    reason: text('reason').notNull(),
    changedBy: text('changed_by').notNull(),
    at: instant('at').notNull(),
  },
  (t) => [index('rate_changes_organizer_idx').on(t.organizerId)],
);

/** An agent's request for a rate below the floor, waiting for (or decided by) a Super Admin. */
export const rateApprovals = pgTable(
  'rate_approvals',
  {
    id: text('id').primaryKey(),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id),
    agentId: text('agent_id').notNull(),
    eventId: text('event_id').references(() => events.id),
    requestedBps: integer('requested_bps').notNull(),
    reason: text('reason').notNull(),
    requestedAt: instant('requested_at').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull(),
  },
  (t) => [index('rate_approvals_organizer_idx').on(t.organizerId)],
);

/**
 * What an organizer is owed for one event: its paid orders less Eventify's fee. Written once the
 * event has ended and sales are final; a Super Admin marks it paid after sending the money.
 */
export const payouts = pgTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    organizerId: text('organizer_id')
      .notNull()
      .references(() => organizers.id),
    eventId: text('event_id')
      .notNull()
      .unique()
      .references(() => events.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').$type<Currency>().notNull(),
    method: text('method').$type<PayoutMethod>().notNull(),
    status: text('status').$type<PayoutStatus>().notNull(),
    /** M-Pesa or bank transaction reference, recorded when marked paid. */
    reference: text('reference'),
    paidAt: instant('paid_at'),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [index('payouts_organizer_idx').on(t.organizerId)],
);

/** Who did what in the admin portal, for looking into a dispute or a mistake. Rows are never changed. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: instant('at').notNull(),
    /** The account that acted, with its email as it was then. */
    accountId: text('account_id').notNull(),
    email: text('email').notNull(),
    /** e.g. "organizer.status", "rate.change", "payout.paid". */
    action: text('action').notNull(),
    /** What it was done to: an organizer handle, a payout id… */
    target: text('target').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
);
