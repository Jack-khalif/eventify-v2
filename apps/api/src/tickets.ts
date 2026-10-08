import { signTicketQr, toEatIso, type TicketView } from '@eventify/shared';
import { asc, eq, sql, type SQL } from 'drizzle-orm';
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
      index: t.index,
      count: order.quantity,
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

/** Everything the Live Pass page needs for one ticket. */
export const ticketView = async (db: Db, signingKey: CryptoKey, id: string) =>
  (await toViews(db, signingKey, await withOrders(db).where(eq(tickets.id, id))))[0];

/** Every ticket whose order matches, soonest event first. */
export const ticketViewsWhere = async (db: Db, signingKey: CryptoKey, where: SQL) =>
  (await toViews(db, signingKey, await withOrders(db).where(where))).sort(
    (a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.index - b.index,
  );

/** Every ticket bought with this email address (lower case). */
export const ticketViewsForEmail = (db: Db, signingKey: CryptoKey, email: string) =>
  ticketViewsWhere(db, signingKey, eq(sql`lower(${orders.buyerEmail})`, email));

/** An order's tickets, in order. */
export const orderTicketViews = async (db: Db, signingKey: CryptoKey, orderId: string) =>
  toViews(
    db,
    signingKey,
    await withOrders(db).where(eq(tickets.orderId, orderId)).orderBy(asc(tickets.index)),
  );
