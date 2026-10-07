import { toEatIso, type OrganizerProfile, type PublicEvent } from '@eventify/shared';
import { and, asc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { events, organizers, tiers } from './db/schema';

const eatIso = (d: Date) => toEatIso(d.getTime());

/** Events with their tiers and organizer, in the shape the public endpoints return. */
export async function loadEvents(db: Db, where?: SQL): Promise<PublicEvent[]> {
  const rows = await db
    .select({ event: events, organizer: organizers })
    .from(events)
    .innerJoin(organizers, eq(events.organizerId, organizers.id))
    .where(where);
  if (rows.length === 0) return [];

  const tierRows = await db
    .select()
    .from(tiers)
    .where(
      inArray(
        tiers.eventId,
        rows.map((r) => r.event.id),
      ),
    )
    .orderBy(asc(tiers.position));

  return rows.map(({ event: e, organizer: o }) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    category: e.category,
    city: e.city,
    currency: e.currency,
    venue: e.venue,
    address: e.address,
    mapUrl: e.mapUrl,
    startsAt: eatIso(e.startsAt),
    endsAt: eatIso(e.endsAt),
    description: e.description,
    coverTone: e.coverTone,
    coverImageUrl: e.coverImageUrl,
    organizerId: e.organizerId,
    status: e.status,
    organizer: { id: o.id, handle: o.handle, name: o.name, type: o.type, verified: o.verified },
    tiers: tierRows
      .filter((t) => t.eventId === e.id)
      .map((t) => ({
        id: t.id,
        name: t.name,
        note: t.note,
        priceMinor: t.priceMinor,
        quantity: t.quantity,
        sold: t.sold,
        saleStartsAt: t.saleStartsAt && eatIso(t.saleStartsAt),
        saleEndsAt: t.saleEndsAt && eatIso(t.saleEndsAt),
      })),
  }));
}

/**
 * Everything the public can see. Discover filters this list in memory with the shared
 * filterEvents(); move the filters into SQL once there are more than a few hundred events.
 */
export const publishedEvents = (db: Db) => loadEvents(db, ne(events.status, 'draft'));

export const publishedEvent = async (db: Db, where: SQL) =>
  (await loadEvents(db, and(where, ne(events.status, 'draft'))))[0];

const monthFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  month: 'short',
  year: 'numeric',
});

/** The organizer's public page, or undefined when there isn't one. */
export async function organizerProfile(
  db: Db,
  handle: string,
  now: number,
): Promise<OrganizerProfile | undefined> {
  const [o] = await db.select().from(organizers).where(eq(organizers.handle, handle));
  if (!o) return undefined;
  const own = await db
    .select()
    .from(events)
    .where(and(eq(events.organizerId, o.id), ne(events.status, 'draft')));
  // No public page for an applicant until they are approved or have an event up.
  if ((o.status === 'pending' || o.status === 'rejected') && own.length === 0) return undefined;
  return {
    id: o.id,
    handle: o.handle,
    name: o.name,
    type: o.type,
    verified: o.verified,
    bio: o.bio,
    bannerTone: o.bannerTone,
    pastEvents: own
      .filter((e) => e.endsAt.getTime() <= now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
      .map((e) => ({ title: e.title, date: monthFmt.format(e.startsAt), tone: e.coverTone })),
  };
}
