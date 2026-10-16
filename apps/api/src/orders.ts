import {
  displayStatus,
  generatePassSecret,
  isCheckoutError,
  ORDER_HOLD_MINUTES,
  randomToken,
  tierAvailability,
  toEatIso,
  validateCheckout,
  type CheckoutRequest,
  type OrderView,
  type PublicEvent,
} from '@eventify/shared';
import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from './db/client';
import {
  events,
  orders,
  organizers,
  paymentAttempts,
  tickets,
  tiers,
  type RefundReason,
} from './db/schema';
import { refundEmail } from './email/refundEmail';
import type { Mailer } from './email/mailer';
import { publishedEvent } from './events';
import type { PaymentCheck, PaymentProvider } from './payments';
import { heldByBuyer } from './tickets';

export type OrderRow = typeof orders.$inferSelect;
export type Failure = { status: 404 | 409 | 422 | 429 | 503; error: string; message: string };
export const isFailure = (r: object): r is Failure => 'error' in r;

export type OrderDeps = {
  db: Db;
  /** null = paid tickets can't be bought yet. */
  payments: PaymentProvider | null;
  /** For refund emails. */
  mailer: Mailer;
  /** Web app origin: card buyers come back to their order page here. */
  siteUrl: string;
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

/** The newest prompt for an order. */
const latestAttempt = async (db: Db, orderId: string) =>
  (
    await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, orderId))
      .orderBy(desc(paymentAttempts.requestedAt))
      .limit(1)
  )[0];

async function toOrderView(db: Db, o: OrderRow): Promise<OrderView> {
  // Tickets passed on to someone else belong to them now, not to whoever has the order link.
  const issued =
    o.status === 'paid'
      ? await db
          .select()
          .from(tickets)
          .where(and(eq(tickets.orderId, o.id), heldByBuyer))
          .orderBy(asc(tickets.index))
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
    paymentUrl:
      o.paymentMethod === 'card' && o.status === 'awaiting_payment'
        ? ((await latestAttempt(db, o.id))?.paymentUrl ?? null)
        : null,
    rateBps: o.rateBps,
    createdAt: eatIso(o.createdAt),
    tickets: issued.map((t) => ({ id: t.id, code: t.code, holderName: t.holderName })),
  };
}

/**
 * Note that a payment prompt is going out. Its id is the reference Paystack knows it by, so it is
 * letters, digits and dashes only (Paystack refuses underscores).
 */
async function recordAttempt(tx: Db, orderId: string, at: number) {
  const id = `pay-${randomBytes(12).toString('hex')}`;
  await tx.insert(paymentAttempts).values({ id, orderId, requestedAt: new Date(at) });
  return id;
}

/** The code printed on ticket number `n` of an event: letters and digits only, e.g. EVT-SAUTI-0412. */
export function ticketCode(eventId: string, n: number) {
  const key = eventId
    .replace(/^evt_/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  return `EVT-${key}-${String(n).padStart(4, '0')}`;
}

/** Mark the order paid, count its tickets as sold and issue them. Call inside a transaction. */
export async function markPaid(tx: Db, o: OrderRow, now: number): Promise<OrderRow> {
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

  const first = event!.ticketSeq - o.quantity + 1;
  await tx.insert(tickets).values(
    Array.from({ length: o.quantity }, (_, i) => ({
      id: randomToken(),
      code: ticketCode(o.eventId, first + i),
      orderId: o.id,
      eventId: o.eventId,
      index: i + 1,
      holderName: o.buyerName,
      secret: generatePassSecret(),
    })),
  );
  return paid!;
}

/**
 * Lock the event's tiers so two buyers can't both take the last ticket, then load it with the
 * tickets in unpaid orders counted as sold: they stay off sale until their hold runs out.
 */
export async function lockEventForSale(tx: Db, eventId: string, at: number) {
  await tx.select({ id: tiers.id }).from(tiers).where(eq(tiers.eventId, eventId)).for('update');
  const event = await publishedEvent(tx, eq(events.id, eventId));
  return event && withHeldAsSold(tx, event, at);
}

async function withHeldAsSold(tx: Db, event: PublicEvent, at: number): Promise<PublicEvent> {
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
  return { ...event, tiers: event.tiers.map((t) => ({ ...t, sold: t.sold + heldFor(t.id) })) };
}

export async function createOrder(
  deps: OrderDeps,
  req: CheckoutRequest,
): Promise<OrderView | Failure> {
  const { db, payments, now } = deps;
  const at = now();
  let attemptId: string | null = null;
  const result = await db.transaction(async (tx): Promise<OrderRow | Failure> => {
    const event = await lockEventForSale(tx, req.eventId, at);
    if (!event) return { status: 404, error: 'not_found', message: 'Not found' };
    if (displayStatus(event, new Date(at)) !== 'live') {
      return { status: 409, error: 'event_ended', message: 'This event has ended.' };
    }

    const check = validateCheckout(await withHeldAsSold(tx, event, at), req, new Date(at));
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
    attemptId = await recordAttempt(tx, order!.id, at);
    return order!;
  });
  if (isFailure(result)) return result;
  // Only once the tickets are safely held: the provider is a network call away.
  if (attemptId) await sendPrompt(deps, result, attemptId);
  return (await withOrder(deps, result.id))!;
}

/**
 * Read an order under a row lock after `change` has had its say, having first released it if its
 * hold has run out. Payments are brought up to date separately, by syncPayment and webhooks.
 */
async function withOrder(
  { db, now }: OrderDeps,
  id: string,
  change?: (tx: Db, order: OrderRow, at: number) => Promise<OrderRow>,
): Promise<OrderView | undefined> {
  const at = now();
  const row = await db.transaction(async (tx) => {
    let [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!o) return undefined;
    if (isOpen(o) && at >= o.holdExpiresAt.getTime()) {
      [o] = await tx.update(orders).set({ status: 'expired' }).where(eq(orders.id, id)).returning();
    }
    return change ? change(tx, o!, at) : o!;
  });
  return row && toOrderView(db, row);
}

// ── Payments ────────────────────────────────────────────────────────────────
//
// The rules, in one place:
// 1. Every prompt (first try or "Resend prompt") is a payment_attempts row whose id is the
//    provider's reference, and it is sent only after the tickets are held and committed.
// 2. A provider's answer, by webhook or by our own check, is applied by settle(): once per
//    attempt, and only after the provider confirms it (webhook bodies are never trusted alone).
// 3. A failure only fails the order if it is about the newest prompt; an M-Pesa prompt nobody has
//    answered within the provider's timeout counts as timed out.
// 4. Money for an order still holding its tickets issues them. Money that arrives after the hold
//    ended still buys them if the event is on and enough are left; otherwise it is refunded and
//    the order is marked refunded.
// 5. A second payment for a paid order, or one that doesn't match the order's total, is refunded.

type Deps = OrderDeps & { payments: PaymentProvider };

/** Ask the provider for a payment. A refusal fails the attempt (and the order) straight away. */
async function sendPrompt(deps: OrderDeps, o: OrderRow, attemptId: string) {
  const { db, payments, siteUrl } = deps;
  if (!payments) return;
  const [event] = await db
    .select({ slug: events.slug })
    .from(events)
    .where(eq(events.id, o.eventId));
  const result = await payments.request({
    reference: attemptId,
    method: o.paymentMethod === 'card' ? 'card' : 'mpesa',
    amountMinor: o.totalMinor,
    currency: o.currency,
    email: o.buyerEmail,
    phone: o.buyerPhone,
    orderId: o.id,
    returnUrl: `${siteUrl}/e/${event!.slug}/checkout/${o.id}`,
  });
  if (result.ok) {
    if (result.paymentUrl) {
      await db
        .update(paymentAttempts)
        .set({ paymentUrl: result.paymentUrl })
        .where(eq(paymentAttempts.id, attemptId));
    }
    return;
  }
  console.warn(`Payment request for ${o.id} refused: ${result.detail}`);
  await settle({ ...deps, payments }, attemptId, {
    state: 'failed',
    failure: result.failure,
    detail: result.detail,
  });
}

export type Settled = { orderId: string; paid: boolean };

/**
 * Apply what the provider says about one prompt (rules 2–5). Safe to call any number of times for
 * the same answer. Returns null when nothing changed.
 */
async function settle(deps: Deps, reference: string, check: PaymentCheck): Promise<Settled | null> {
  if (check.state === 'pending') return null;
  const { db, now } = deps;
  const at = now();
  const done = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, reference))
      .for('update');
    if (!attempt) return null;
    let [o] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for('update');
    if (!o) return null;

    if (check.state === 'failed') {
      if (attempt.outcome) return null;
      await tx
        .update(paymentAttempts)
        .set({ outcome: check.failure, detail: check.detail, resolvedAt: new Date(at) })
        .where(eq(paymentAttempts.id, reference));
      const newest =
        !o.paymentRequestedAt || attempt.requestedAt.getTime() >= o.paymentRequestedAt.getTime();
      if (o.status === 'awaiting_payment' && newest) {
        await tx
          .update(orders)
          .set({ status: 'failed', failureReason: check.failure })
          .where(eq(orders.id, o.id));
      }
      return { orderId: o.id, paid: false, refund: null };
    }

    // Paid. A prompt we had already given up on (timed out) can still turn out to be paid.
    if (attempt.outcome === 'paid') return null;
    let refund: RefundReason | null = null;
    if (check.amountMinor !== o.totalMinor || check.currency !== o.currency) {
      console.error(
        `Payment ${reference} for order ${o.id} was ${check.currency} ${check.amountMinor}, expected ${o.currency} ${o.totalMinor}`,
      );
      refund = 'amount_mismatch';
    } else if (o.status === 'paid') {
      refund = 'duplicate';
    } else if (isOpen(o) && at < o.holdExpiresAt.getTime()) {
      o = await markPaid(tx, o, at);
    } else if (await stillAvailable(tx, o, at)) {
      o = await markPaid(tx, o, at);
    } else {
      refund = 'late';
      [o] = await tx
        .update(orders)
        .set({ status: 'refunded' })
        .where(eq(orders.id, o.id))
        .returning();
    }
    await tx
      .update(paymentAttempts)
      .set({
        outcome: 'paid',
        detail: 'Paid',
        resolvedAt: new Date(at),
        refundReason: refund,
        refundStatus: refund && 'due',
      })
      .where(eq(paymentAttempts.id, reference));
    return { orderId: o!.id, paid: o!.status === 'paid', refund };
  });
  if (!done) return null;
  if (done.refund) await sendRefund(deps, reference);
  return { orderId: done.orderId, paid: done.paid };
}

/** Can an order whose hold has ended still have its tickets? Only if the event is on and they're left. */
async function stillAvailable(tx: Db, o: OrderRow, at: number) {
  const event = await lockEventForSale(tx, o.eventId, at);
  if (!event || displayStatus(event, new Date(at)) !== 'live') return false;
  const tier = event.tiers.find((t) => t.id === o.tierId);
  if (!tier) return false;
  const a = tierAvailability(tier, new Date(at));
  return a.status === 'on_sale' && (a.remaining === null || a.remaining >= o.quantity);
}

/** Send one refund that's due, then tell the buyer. Left due (and retried later) if the provider says no. */
async function sendRefund(deps: Deps, attemptId: string) {
  const { db, payments } = deps;
  const [row] = await db
    .select({ attempt: paymentAttempts, order: orders, title: events.title })
    .from(paymentAttempts)
    .innerJoin(orders, eq(paymentAttempts.orderId, orders.id))
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.refundStatus, 'due')));
  if (!row) return;
  if (!(await payments.refund(attemptId))) return;
  await db
    .update(paymentAttempts)
    .set({ refundStatus: 'requested' })
    .where(eq(paymentAttempts.id, attemptId));
  try {
    await deps.mailer(
      refundEmail({
        buyer: { name: row.order.buyerName, email: row.order.buyerEmail },
        attemptId,
        eventTitle: row.title,
        amountMinor: row.order.totalMinor,
        currency: row.order.currency,
        reason: row.attempt.refundReason!,
        siteUrl: deps.siteUrl,
      }),
    );
  } catch (error) {
    console.error(`Refund email for ${attemptId} failed`, error);
  }
}

/** Try again any refunds the provider turned down or we couldn't reach it for. */
export async function retryDueRefunds(deps: OrderDeps) {
  const { db, payments } = deps;
  if (!payments) return;
  const due = await db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.refundStatus, 'due'));
  for (const { id } of due) await sendRefund({ ...deps, payments }, id);
}

/**
 * Ask the provider about an order's newest open prompt ourselves, in case its webhook is slow or
 * lost. Throttled per prompt; card prompts are checked as soon as the buyer is back with us.
 */
async function syncPayment(deps: OrderDeps, orderId: string) {
  const { db, payments, now } = deps;
  if (!payments) return;
  const [row] = await db
    .select({ o: orders, a: paymentAttempts })
    .from(orders)
    .innerJoin(paymentAttempts, eq(paymentAttempts.orderId, orders.id))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, 'awaiting_payment'),
        isNull(paymentAttempts.outcome),
      ),
    )
    .orderBy(desc(paymentAttempts.requestedAt))
    .limit(1);
  if (!row) return;
  const { o, a } = row;
  const at = now();
  const card = o.paymentMethod === 'card';
  const age = at - a.requestedAt.getTime();
  if (age < (card ? 0 : payments.checkAfterMs)) return;
  if (a.checkedAt && at - a.checkedAt.getTime() < payments.checkEveryMs) return;

  await db
    .update(paymentAttempts)
    .set({ checkedAt: new Date(at) })
    .where(eq(paymentAttempts.id, a.id));
  let check = await payments.check(
    {
      reference: a.id,
      buyerPhone: o.buyerPhone,
      requestedAt: a.requestedAt,
      amountMinor: o.totalMinor,
      currency: o.currency,
    },
    at,
  );
  if (
    check.state === 'pending' &&
    !card &&
    payments.promptTimeoutMs !== null &&
    age >= payments.promptTimeoutMs
  ) {
    check = { state: 'failed', failure: 'timeout', detail: 'No answer to the prompt in time' };
  }
  await settle({ ...deps, payments }, a.id, check);
}

/**
 * A webhook from the provider. Returns null if it isn't genuine; otherwise what came of it, once
 * the provider has confirmed the payment's state directly.
 */
export async function paymentWebhook(
  deps: OrderDeps,
  rawBody: string,
  header: (name: string) => string | undefined,
): Promise<{ settled: Settled | null } | null> {
  const { db, payments } = deps;
  const reference = payments?.webhookReference?.(rawBody, header);
  if (!payments || !reference) return null;
  const [row] = await db
    .select({ o: orders, a: paymentAttempts })
    .from(paymentAttempts)
    .innerJoin(orders, eq(paymentAttempts.orderId, orders.id))
    .where(eq(paymentAttempts.id, reference));
  // Not one of ours (another integration on the same Paystack account): nothing to do.
  if (!row) return { settled: null };
  const check = await payments.check(
    {
      reference,
      buyerPhone: row.o.buyerPhone,
      requestedAt: row.a.requestedAt,
      amountMinor: row.o.totalMinor,
      currency: row.o.currency,
    },
    deps.now(),
  );
  const settled = await settle({ ...deps, payments }, reference, check);
  await retryDueRefunds(deps);
  return { settled };
}

export async function getOrder(deps: OrderDeps, id: string) {
  await syncPayment(deps, id);
  return withOrder(deps, id);
}

/** "Resend prompt" / "Try again": a fresh payment request for the same order while the hold lasts. */
export async function retryPayment(deps: OrderDeps, id: string) {
  let attemptId: string | null = null;
  let row: OrderRow | null = null;
  const order = await withOrder(deps, id, async (tx, o, at) => {
    if (!isOpen(o)) return o;
    attemptId = await recordAttempt(tx, o.id, at);
    const [next] = await tx
      .update(orders)
      .set({ status: 'awaiting_payment', failureReason: null, paymentRequestedAt: new Date(at) })
      .where(eq(orders.id, o.id))
      .returning();
    row = next!;
    return next!;
  });
  if (!attemptId || !row) return order;
  await sendPrompt(deps, row, attemptId);
  return withOrder(deps, id);
}

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
