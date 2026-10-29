import { type DoorList, type DoorSyncRequest, type PublicEvent } from '@eventify/shared';
import { and, asc, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { Db } from './db/client';
import { eventDoors, events, orders, tickets, tiers } from './db/schema';
import { loadEvents } from './events';
import { inUse } from './tickets';
import { eatIso } from './time';

export type VerifyKey = DoorList['verifyKey'];

/** The event a check-in link is for. The code is the only credential door staff have. */
export const eventForCheckinCode = async (db: Db, code: string) =>
  (await loadEvents(db, eq(events.checkinCode, code)))[0];

/** Everything a door device needs to check people in with no connection. */
export async function doorList(
  db: Db,
  verifyKey: VerifyKey,
  event: PublicEvent,
  checkinCode: string,
  now: number,
): Promise<DoorList> {
  const guests = await db
    .select({ ticket: tickets, phone: orders.buyerPhone, tierName: tiers.name })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(tiers, eq(orders.tierId, tiers.id))
    .where(and(eq(tickets.eventId, event.id), inUse))
    .orderBy(asc(tickets.code));
  // Tickets passed on to someone else, so a door can say so when an old pass turns up.
  const passedOn = await db
    .select({ ticketId: tickets.id, code: tickets.code })
    .from(tickets)
    .where(and(eq(tickets.eventId, event.id), isNotNull(tickets.transferredAt)));
  const doors = await db
    .select()
    .from(eventDoors)
    .where(eq(eventDoors.eventId, event.id))
    .orderBy(asc(eventDoors.name));
  return {
    checkinCode,
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    doors: doors.map((d) => d.name),
    guests: guests.map(({ ticket: t, phone, tierName }) => ({
      ticketId: t.id,
      code: t.code,
      name: t.holderName,
      // The buyer's number means nothing for a ticket they passed on to someone else.
      phone: t.holderEmail ? '' : phone,
      tierName,
      checkedInAt: t.checkedInAt && eatIso(t.checkedInAt),
      checkedInDoor: t.checkedInDoor,
    })),
    transferred: passedOn,
    verifyKey,
    downloadedAt: eatIso(new Date(now)),
  };
}

/** A device's clock may run ahead, but a check-in further in the future than this is a mistake. */
const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

/**
 * Merge a device's check-ins and hand back the merged list. Tickets for other events, and tickets
 * since passed on, are ignored; when two devices checked the same ticket in, the earlier one stands.
 */
export async function syncDoor(
  db: Db,
  verifyKey: VerifyKey,
  event: PublicEvent,
  checkinCode: string,
  req: DoorSyncRequest,
  now: number,
): Promise<DoorList> {
  const door = req.door.trim();
  await db.insert(eventDoors).values({ eventId: event.id, name: door }).onConflictDoNothing();

  for (const c of req.checkIns) {
    const at = new Date(Math.min(Date.parse(c.at), now + MAX_CLOCK_AHEAD_MS));
    await db
      .update(tickets)
      .set({ checkedInAt: at, checkedInDoor: door })
      .where(
        and(
          eq(tickets.id, c.ticketId),
          eq(tickets.eventId, event.id),
          // A device that hadn't synced since a transfer can't check in the ticket it replaced.
          inUse,
          or(isNull(tickets.checkedInAt), gt(tickets.checkedInAt, at)),
        ),
      );
  }
  return doorList(db, verifyKey, event, checkinCode, now);
}
