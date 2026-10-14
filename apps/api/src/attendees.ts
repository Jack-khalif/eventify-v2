import type { AttendeeList } from '@eventify/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, orders, tickets, tiers } from './db/schema';
import type { OrganizerRow } from './organizer';
import { inUse } from './tickets';
import { eatIso } from './time';

/**
 * Everyone holding a ticket for one of this organizer's events, by name, for the spreadsheet and the
 * printed door list. Undefined when the event isn't theirs.
 */
export async function attendeeList(
  db: Db,
  o: OrganizerRow,
  eventId: string,
): Promise<AttendeeList | undefined> {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizerId, o.id)));
  if (!event) return undefined;
  const rows = await db
    .select({ ticket: tickets, order: orders, tierName: tiers.name })
    .from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(tiers, eq(orders.tierId, tiers.id))
    .where(and(eq(tickets.eventId, eventId), inUse));
  return {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      venue: event.venue,
      startsAt: eatIso(event.startsAt),
      endsAt: eatIso(event.endsAt),
    },
    attendees: rows
      .map(({ ticket: t, order, tierName }) => ({
        ticketId: t.id,
        code: t.code,
        name: t.holderName,
        email: t.holderEmail ?? order.buyerEmail,
        // The buyer's number isn't the new holder's after a transfer.
        phone: t.holderEmail ? '' : order.buyerPhone,
        tierName,
        kind: order.kind,
        checkedInAt: t.checkedInAt && eatIso(t.checkedInAt),
      }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
          a.code.localeCompare(b.code),
      ),
  };
}
