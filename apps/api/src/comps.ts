import {
  isCheckoutError,
  randomToken,
  toEatIso,
  validateComp,
  type CompRequest,
  tierRemaining,
  type CompList,
  type CompRow,
} from '@eventify/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, orders, tiers } from './db/schema';
import { loadEvents } from './events';
import { lockEventForSale, markPaid, type Failure } from './orders';
import type { OrganizerRow } from './organizer';

/**
 * Give tickets away: a $0 order of kind "comp", paid at once and issued like any other, so the
 * guest gets the same email, ticket page and place on the door list. Undefined when the event isn't
 * this organizer's. The caller has checked the organizer is active and sends the email.
 */
export async function issueComps(
  { db, now }: { db: Db; now: () => number },
  o: OrganizerRow,
  eventId: string,
  req: CompRequest,
): Promise<{ orderId: string } | Failure | undefined> {
  const at = now();
  return db.transaction(async (tx) => {
    const [own] = await tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizerId, o.id)));
    if (!own) return undefined;
    const event = await lockEventForSale(tx, eventId, at);
    if (!event) return undefined;
    const check = validateComp(event, req, new Date(at));
    if (isCheckoutError(check)) return check;

    const [order] = await tx
      .insert(orders)
      .values({
        id: `ord_${randomToken()}`,
        eventId,
        tierId: check.tier.id,
        quantity: req.quantity,
        kind: 'comp',
        totalMinor: 0,
        currency: event.currency,
        buyerName: req.name,
        // Empty when the organizer didn't give one: the guest then finds the tickets by email.
        buyerPhone: req.phone ?? '',
        buyerEmail: req.email,
        paymentMethod: null,
        status: 'awaiting_payment',
        holdExpiresAt: new Date(at),
        rateBps: 0,
        createdAt: new Date(at),
      })
      .returning();
    await markPaid(tx, order!, at);
    return { orderId: order!.id };
  });
}

const toRow = ({
  order: o,
  tierName,
}: {
  order: typeof orders.$inferSelect;
  tierName: string;
}): CompRow => ({
  name: o.buyerName,
  email: o.buyerEmail,
  tierName,
  quantity: o.quantity,
  issuedAt: toEatIso((o.paidAt ?? o.createdAt).getTime()),
  emailed: o.emailSentAt !== null,
});

/** The comps issued for one of this organizer's events, newest first, and the tiers to pick from. */
export async function compList(
  db: Db,
  o: OrganizerRow,
  eventId: string,
): Promise<CompList | undefined> {
  const [event] = await loadEvents(db, and(eq(events.id, eventId), eq(events.organizerId, o.id)));
  if (!event) return undefined;
  const rows = await db
    .select({ order: orders, tierName: tiers.name })
    .from(orders)
    .innerJoin(tiers, eq(orders.tierId, tiers.id))
    .where(and(eq(orders.eventId, eventId), eq(orders.kind, 'comp'), eq(orders.status, 'paid')))
    .orderBy(desc(orders.createdAt));
  return {
    comps: rows.map(toRow),
    tiers: event.tiers.map((t) => ({ id: t.id, name: t.name, remaining: tierRemaining(t) })),
  };
}
