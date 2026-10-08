import {
  displayStatus,
  generatePassSecret,
  isCheckoutError,
  ORDER_HOLD_MINUTES,
  randomToken,
  toEatIso,
  validateCheckout,
  type CheckoutRequest,
  type OrderView,
  type PaymentFailure,
} from '@eventify/shared';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, orders, organizers, paymentAttempts, tickets, tiers } from './db/schema';
import { publishedEvent } from './events';
import type { PaymentProvider } from './payments';

export type OrderRow = typeof orders.$inferSelect;
export type Failure = { status: 404 | 409 | 422 | 429 | 503; error: string; message: string };
export const isFailure = (r: object): r is Failure => 'error' in r;

export type OrderDeps = {
  db: Db;
  /** null = paid tickets can't be bought yet. */
  payments: PaymentProvider | null;
  now: () => number;
};

/**
 * Unpaid orders one phone number may have open at once. Each holds tickets off sale for ten
 * minutes, so without a cap one person could keep a small event looking sold out.
 */
export const MAX_OPEN_ORDERS_PER_PHONE = 3;

/** Statuses whose tickets are still held for the buyer (until holdExpiresAt). */
const OPEN = ['awaiting_payment', 'failed'] as const;
const isOpen = (o: OrderRow) => o.status === 'awaiting_payment' || o.status === 'failed';

const eatIso = (d: Date) => toEatIso(d.getTime());

async function toOrderView(db: Db, o: OrderRow): Promise<OrderView> {
  const issued =
    o.status === 'paid'
      ? await db.select().from(tickets).where(eq(tickets.orderId, o.id)).orderBy(asc(tickets.index))
      : [];
  return {
    id: o.id,
    eventId: o.eventId,
    tierId: o.tierId,
    quantity: o.quantity,
    totalMinor: o.totalMinor,
    currency: o.currency,
    buyer: { name: o.buyerName, phone: o.buyerPhone, email: o.buyerEmail },
    paymentMethod: o.paymentMethod,
    status: o.status,
    failureReason: o.failureReason,
    paymentRequestedAt: o.paymentRequestedAt && eatIso(o.paymentRequestedAt),
    holdExpiresAt: eatIso(o.holdExpiresAt),
    rateBps: o.rateBps,
    createdAt: eatIso(o.createdAt),
    tickets: issued.map((t) => ({ id: t.id, code: t.code, holderName: t.holderName })),
  };
}

/** Note that a payment prompt went out, so the admin overview can count attempts and outcomes. */
const recordAttempt = (tx: Db, orderId: string, at: number) =>
  tx
    .insert(paymentAttempts)
    .values({ id: `pay_${randomToken(12)}`, orderId, requestedAt: new Date(at) });

const resolveAttempt = (tx: Db, orderId: string, outcome: 'paid' | PaymentFailure, at: number) =>
  tx
    .update(paymentAttempts)
    .set({ outcome, resolvedAt: new Date(at) })
    .where(and(eq(paymentAttempts.orderId, orderId), isNull(paymentAttempts.outcome)));

/** Mark the order paid, count its tickets as sold and issue them. Call inside a transaction. */
async function markPaid(tx: Db, o: OrderRow, now: number): Promise<OrderRow> {
  const [paid] = await tx
    .update(orders)
    .set({ status: 'paid', failureReason: null, paidAt: new Date(now) })
    .where(eq(orders.id, o.id))
    .returning();
  await tx
    .update(tiers)
    .set({ sold: sql`${tiers.sold} + ${o.quantity}` })
    .where(eq(tiers.id, o.tierId));
  const [event] = await tx
    .update(events)
    .set({ ticketSeq: sql`${events.ticketSeq} + ${o.quantity}` })
    .where(eq(events.id, o.eventId))
    .returning({ ticketSeq: events.ticketSeq });

  // Letters and digits only, e.g. evt_sauti → EVT-SAUTI-0412.
  const key = o.eventId
    .replace(/^evt_/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  const first = event!.ticketSeq - o.quantity + 1;
  await tx.insert(tickets).values(
    Array.from({ length: o.quantity }, (_, i) => ({
      id: randomToken(),
      code: `EVT-${key}-${String(first + i).padStart(4, '0')}`,
      orderId: o.id,
      eventId: o.eventId,
      index: i + 1,
      holderName: o.buyerName,
      secret: generatePassSecret(),
    })),
  );
  return paid!;
}

export async function createOrder(
  { db, payments, now }: OrderDeps,
  req: CheckoutRequest,
): Promise<OrderView | Failure> {
  const at = now();
  const result = await db.transaction(async (tx): Promise<OrderRow | Failure> => {
    // Lock the event's tiers so two buyers can't both take the last ticket.
    await tx
      .select({ id: tiers.id })
      .from(tiers)
      .where(eq(tiers.eventId, req.eventId))
      .for('update');
    const event = await publishedEvent(tx, eq(events.id, req.eventId));
    if (!event) return { status: 404, error: 'not_found', message: 'Not found' };
    if (displayStatus(event, new Date(at)) !== 'live') {
      return { status: 409, error: 'event_ended', message: 'This event has ended.' };
    }

    // Tickets in unpaid orders stay off sale until their hold runs out.
    const held = await tx
      .select({ tierId: orders.tierId, quantity: sql<number>`sum(${orders.quantity})::int` })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, event.id),
          inArray(orders.status, OPEN),
          gt(orders.holdExpiresAt, new Date(at)),
        ),
      )
      .groupBy(orders.tierId);
    const heldFor = (tierId: string) => held.find((h) => h.tierId === tierId)?.quantity ?? 0;
    const check = validateCheckout(
      { ...event, tiers: event.tiers.map((t) => ({ ...t, sold: t.sold + heldFor(t.id) })) },
      req,
      new Date(at),
    );
    if (isCheckoutError(check)) return check;

    const [open] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.buyerPhone, req.buyer.phone),
          inArray(orders.status, OPEN),
          gt(orders.holdExpiresAt, new Date(at)),
        ),
      );
    if (open!.count >= MAX_OPEN_ORDERS_PER_PHONE) {
      return {
        status: 429,
        error: 'too_many_open_orders',
        message: 'You have unpaid orders waiting. Finish or cancel one of them first.',
      };
    }

    const free = check.totalMinor === 0;
    if (!free && !payments) {
      return {
        status: 503,
        error: 'payments_unavailable',
        message: 'Paid tickets aren’t on sale yet. Please check back soon.',
      };
    }

    // The rate in force when the order is placed; later rate changes don't touch it.
    const [rate] = await tx
      .select({ bps: sql<number>`coalesce(${events.rateBps}, ${organizers.rateBps})` })
      .from(events)
      .innerJoin(organizers, eq(events.organizerId, organizers.id))
      .where(eq(events.id, event.id));

    const [order] = await tx
      .insert(orders)
      .values({
        id: `ord_${randomToken()}`,
        eventId: event.id,
        tierId: check.tier.id,
        quantity: req.quantity,
        totalMinor: check.totalMinor,
        currency: event.currency,
        buyerName: req.buyer.name,
        buyerPhone: req.buyer.phone,
        buyerEmail: req.buyer.email,
        paymentMethod: free ? null : req.paymentMethod,
        status: 'awaiting_payment',
        paymentRequestedAt: free ? null : new Date(at),
        holdExpiresAt: new Date(at + ORDER_HOLD_MINUTES * 60_000),
        rateBps: rate!.bps,
        createdAt: new Date(at),
      })
      .returning();
    if (free) return markPaid(tx, order!, at);
    await recordAttempt(tx, order!.id, at);
    return order!;
  });
  return isFailure(result) ? result : toOrderView(db, result);
}

/**
 * Read an order under a row lock after `change` has had its say, having first moved it on the way
 * the payment provider and the hold timer would have by now.
 */
async function withOrder(
  { db, payments, now }: OrderDeps,
  id: string,
  change?: (tx: Db, order: OrderRow, at: number) => Promise<OrderRow>,
): Promise<OrderView | undefined> {
  const at = now();
  const row = await db.transaction(async (tx) => {
    let [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!o) return undefined;

    if (isOpen(o) && at >= o.holdExpiresAt.getTime()) {
      [o] = await tx.update(orders).set({ status: 'expired' }).where(eq(orders.id, id)).returning();
    } else if (o.status === 'awaiting_payment' && o.paymentRequestedAt && payments) {
      const state = payments({ ...o, paymentRequestedAt: o.paymentRequestedAt }, at);
      if (state) await resolveAttempt(tx, id, state, at);
      if (state === 'paid') o = await markPaid(tx, o, at);
      else if (state) {
        [o] = await tx
          .update(orders)
          .set({ status: 'failed', failureReason: state })
          .where(eq(orders.id, id))
          .returning();
      }
    }
    return change ? change(tx, o!, at) : o!;
  });
  return row && toOrderView(db, row);
}

export const getOrder = (deps: OrderDeps, id: string) => withOrder(deps, id);

/** "Resend prompt" / "Try again": a fresh payment request for the same order while the hold lasts. */
export const retryPayment = (deps: OrderDeps, id: string) =>
  withOrder(deps, id, async (tx, o, at) => {
    if (!isOpen(o)) return o;
    await recordAttempt(tx, o.id, at);
    const [next] = await tx
      .update(orders)
      .set({ status: 'awaiting_payment', failureReason: null, paymentRequestedAt: new Date(at) })
      .where(eq(orders.id, o.id))
      .returning();
    return next!;
  });

export const cancelOrder = (deps: OrderDeps, id: string) =>
  withOrder(deps, id, async (tx, o) => {
    if (!isOpen(o)) return o;
    const [next] = await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, o.id))
      .returning();
    return next!;
  });
