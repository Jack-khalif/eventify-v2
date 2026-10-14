import { signTicketQr, toEatIso, type TicketView } from '@eventify/shared';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, orders, tickets } from './db/schema';
import { publishedEvent } from './events';

type TicketRow = typeof tickets.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

async function toViews(
  db: Db,
  signingKey: CryptoKey,
  rows: { ticket: TicketRow; order: OrderRow }[],
): Promise<TicketView[]> {
  const views: TicketView[] = [];
  for (const { ticket: t, order } of rows) {
    const event = await publishedEvent(db, eq(events.id, t.eventId));
    if (!event) continue;
    views.push({
      id: t.id,
      code: t.code,
      holderName: t.holderName,
      tierName: event.tiers.find((tier) => tier.id === order.tierId)?.name ?? '',
      // A ticket passed on stands alone for its new holder.
      index: t.transferredFromId ? 1 : t.index,
      count: t.transferredFromId ? 1 : order.quantity,
      event,
      passSecret: t.secret,
      qrPayload: await signTicketQr(signingKey, t.id),
      checkedInAt: t.checkedInAt && toEatIso(t.checkedInAt.getTime()),
    });
  }
  return views;
}

const withOrders = (db: Db) =>
  db
    .select({ ticket: tickets, order: orders })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id));

/** Tickets that still work: not passed on to someone else. */
export const inUse = isNull(tickets.transferredAt);

/** Tickets the buyer still holds: in use and never passed on to them by someone else. */
export const heldByBuyer = and(inUse, isNull(tickets.holderEmail));

/** Everything the Live Pass page needs for one ticket. */
export const ticketView = async (db: Db, signingKey: CryptoKey, id: string) =>
  (await toViews(db, signingKey, await withOrders(db).where(and(eq(tickets.id, id), inUse))))[0];

/** Every ticket that matches, soonest event first. */
export const ticketViewsWhere = async (db: Db, signingKey: CryptoKey, where: SQL | undefined) =>
  (await toViews(db, signingKey, await withOrders(db).where(where))).sort(
    (a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.index - b.index,
  );

/** Every ticket held by this email address (lower case): bought with it, or passed on to it. */
export const ticketViewsForEmail = (db: Db, signingKey: CryptoKey, email: string) =>
  ticketViewsWhere(
    db,
    signingKey,
    and(inUse, eq(sql`lower(coalesce(${tickets.holderEmail}, ${orders.buyerEmail}))`, email)),
  );

/** An order's tickets that the buyer still holds, in order. */
export const orderTicketViews = async (db: Db, signingKey: CryptoKey, orderId: string) =>
  toViews(
    db,
    signingKey,
    await withOrders(db)
      .where(and(eq(tickets.orderId, orderId), heldByBuyer))
      .orderBy(asc(tickets.index)),
  );
