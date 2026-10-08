import {
  canApplyToHost,
  CATEGORY_TONE,
  CITY_CURRENCY,
  DEFAULT_RATE_BPS,
  displayStatus,
  RESERVED_HANDLES,
  salesSummary,
  slugify,
  type CreateEventRequest,
  type EventDashboard,
  type OrganizerApplicationRequest,
  type OrganizerHome,
  type PublicEvent,
  type SessionUser,
} from '@eventify/shared';
import { and, count, eq, gte, isNotNull, like, ne, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { sessionUserFor, type AccountRow } from './auth';
import type { Db } from './db/client';
import {
  accounts,
  eventDoors,
  events,
  eventViews,
  orders,
  organizerApplications,
  organizers,
  tickets,
  tiers,
} from './db/schema';
import { loadEvents } from './events';
import { storePoster } from './images';
import { eatDay, eatDaySql, eatDayStart } from './time';

export type OrganizerRow = typeof organizers.$inferSelect;
type Failure = { status: 400 | 422; error: string; message: string };
export const isFailure = (r: object): r is Failure => 'error' in r;

const hex = (bytes: number) => randomBytes(bytes).toString('hex');

/** The first of `base`, `base-2`, `base-3`… that `taken` doesn't hold. */
function firstFree(base: string, taken: ReadonlySet<string>) {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
}

async function uniqueHandle(tx: Db, name: string, ownId: string) {
  const slug = slugify(name).slice(0, 36).replace(/-$/, '') || 'organizer';
  const base = slug.length < 2 ? `${slug}-events` : slug;
  const used = await tx
    .select({ handle: organizers.handle })
    .from(organizers)
    .where(and(like(organizers.handle, `${base}%`), ne(organizers.id, ownId)));
  return firstFree(base, new Set([...RESERVED_HANDLES, ...used.map((o) => o.handle)]));
}

/**
 * Record an application to host: a new organizer, or (for a declined one applying again) the same
 * organizer with the new details. Either way it waits as "pending" for a Super Admin.
 * Null when this account can't apply (already an organizer in good standing, or staff).
 */
export async function applyToHost(
  { db, now }: { db: Db; now: () => number },
  accountId: string,
  req: OrganizerApplicationRequest,
): Promise<SessionUser | null> {
  return db.transaction(async (tx) => {
    // Locked, so sending the form twice can't make two organizers.
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for('update');
    if (!account || !canApplyToHost(await sessionUserFor(tx, account))) return null;

    const id = account.organizerId ?? `org_${hex(5)}`;
    const details = {
      handle: await uniqueHandle(tx, req.organizerName, id),
      name: req.organizerName,
      type: req.type,
      bannerTone: CATEGORY_TONE[req.category],
      city: req.city,
      category: req.category,
      status: 'pending' as const,
      payoutMethod: req.payoutMethod,
    };
    await tx
      .insert(organizers)
      .values({ id, ...details, rateBps: DEFAULT_RATE_BPS })
      .onConflictDoUpdate({ target: organizers.id, set: details });

    const application = {
      contactName: req.contactName,
      email: account.email,
      about: req.about,
      appliedAt: new Date(now()),
    };
    await tx
      .insert(organizerApplications)
      .values({ organizerId: id, ...application })
      .onConflictDoUpdate({ target: organizerApplications.organizerId, set: application });

    const [updated] = await tx
      .update(accounts)
      .set({ name: req.contactName, role: 'organizer', organizerId: id })
      .where(eq(accounts.id, account.id))
      .returning();
    return sessionUserFor(tx, updated!);
  });
}

/** The organizer this account acts for (whatever their status), if any. */
export async function organizerFor(db: Db, account: AccountRow): Promise<OrganizerRow | undefined> {
  if (!account.organizerId) return undefined;
  const [o] = await db.select().from(organizers).where(eq(organizers.id, account.organizerId));
  return o;
}

const bySoonest = (a: PublicEvent, b: PublicEvent) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt);

export async function organizerHome(db: Db, o: OrganizerRow, now: number): Promise<OrganizerHome> {
  const own = await loadEvents(db, eq(events.organizerId, o.id));
  return {
    organizer: {
      id: o.id,
      handle: o.handle,
      name: o.name,
      type: o.type,
      verified: o.verified,
      rateBps: o.rateBps,
    },
    events: own.sort(bySoonest).map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: displayStatus(e, new Date(now)),
      coverTone: e.coverTone,
      coverImageUrl: e.coverImageUrl,
      ticketsSold: salesSummary(e).ticketsSold,
    })),
  };
}

const DASHBOARD_DAYS = 14;

/** Sales, check-ins and page views for one event. Undefined when it isn't this organizer's. */
export async function eventDashboard(
  db: Db,
  o: OrganizerRow,
  eventId: string,
  now: number,
): Promise<EventDashboard | undefined> {
  const [e] = await loadEvents(db, and(eq(events.id, eventId), eq(events.organizerId, o.id)));
  if (!e) return undefined;
  const [own] = await db
    .select({ rateBps: events.rateBps, checkinCode: events.checkinCode })
    .from(events)
    .where(eq(events.id, e.id));
  const today = eatDay(now);

  const soldByDay = await db
    .select({ day: eatDaySql(orders.paidAt), tickets: sql<number>`sum(${orders.quantity})::int` })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, e.id),
        eq(orders.status, 'paid'),
        gte(orders.paidAt, eatDayStart(today - DASHBOARD_DAYS + 1)),
      ),
    )
    .groupBy(eatDaySql(orders.paidAt));
  const dailySales = Array<number>(DASHBOARD_DAYS).fill(0);
  for (const { day, tickets: n } of soldByDay) dailySales[day - today + DASHBOARD_DAYS - 1] = n;

  const [views] = await db
    .select({
      total: sql<number>`coalesce(sum(${eventViews.count}), 0)::int`,
      week: sql<number>`coalesce(sum(${eventViews.count}) filter (where ${eventViews.day} > ${today - 7}), 0)::int`,
    })
    .from(eventViews)
    .where(eq(eventViews.eventId, e.id));

  const doorCounts = await db
    .select({ name: tickets.checkedInDoor, count: count() })
    .from(tickets)
    .where(and(eq(tickets.eventId, e.id), isNotNull(tickets.checkedInAt)))
    .groupBy(tickets.checkedInDoor);
  const doorNames = await db.select().from(eventDoors).where(eq(eventDoors.eventId, e.id));
  const names = new Set([...doorNames.map((d) => d.name), ...doorCounts.map((d) => d.name ?? '')]);
  names.delete('');

  return {
    ...salesSummary(e),
    eventId: e.id,
    title: e.title,
    slug: e.slug,
    currency: e.currency,
    rateBps: own!.rateBps ?? o.rateBps,
    checkIns: doorCounts.reduce((sum, d) => sum + d.count, 0),
    pageViews: views?.total ?? 0,
    pageViewsThisWeek: views?.week ?? 0,
    dailySales,
    doors: [...names].sort().map((name) => ({
      doorId: `door_${slugify(name)}`,
      name,
      count: doorCounts.find((d) => d.name === name)?.count ?? 0,
    })),
    checkinCode: own!.checkinCode,
  };
}

/** Publish a new event. The caller has already checked that this organizer is approved. */
export async function createEvent(
  { db, now }: { db: Db; now: () => number },
  o: OrganizerRow,
  req: CreateEventRequest,
): Promise<PublicEvent | Failure> {
  const at = now();
  const starts = Date.parse(req.startsAt);
  const ends = Date.parse(req.endsAt);
  if (starts <= at) {
    return { status: 422, error: 'starts_in_past', message: 'Pick a date and time in the future.' };
  }
  if (ends <= starts) {
    return {
      status: 422,
      error: 'ends_before_start',
      message: 'The event must end after it starts.',
    };
  }
  const tierNames = new Set(req.tiers.map((t) => t.name.trim().toLowerCase()));
  if (tierNames.size !== req.tiers.length) {
    return { status: 422, error: 'duplicate_tier', message: 'Each tier needs a different name.' };
  }

  return db.transaction(async (tx) => {
    let coverImageUrl: string | null = null;
    if (req.coverImageUrl) {
      coverImageUrl = await storePoster(tx, req.coverImageUrl, at);
      if (!coverImageUrl) {
        return {
          status: 422,
          error: 'bad_poster',
          message: 'That poster couldn’t be used. Try a JPEG or PNG under 2 MB.',
        } as const;
      }
    }

    const base = slugify(req.title);
    const used = await tx
      .select({ slug: events.slug })
      .from(events)
      .where(like(events.slug, `${base}%`));
    const slug = firstFree(base, new Set(used.map((e) => e.slug)));
    // Letters and digits only: ticket codes are built from it (EVT-{ID}-0001).
    const id = `evt_${hex(5)}`;

    await tx.insert(events).values({
      id,
      slug,
      title: req.title,
      category: req.category,
      city: req.city,
      currency: CITY_CURRENCY[req.city],
      venue: req.venue,
      startsAt: new Date(starts),
      endsAt: new Date(ends),
      description: req.description,
      coverTone: CATEGORY_TONE[req.category],
      coverImageUrl,
      organizerId: o.id,
      status: 'live',
      // 48 random bits: the link is the door staff's only credential.
      checkinCode: `${slug.split('-')[0]!.slice(0, 12)}-${hex(6)}`,
      createdAt: new Date(at),
    });
    await tx.insert(tiers).values(
      req.tiers.map((t, i) => ({
        id: `tier_${id}_${i + 1}`,
        eventId: id,
        position: i + 1,
        name: t.name,
        note: t.note,
        priceMinor: t.priceMinor,
        quantity: t.quantity,
        saleStartsAt: t.saleStartsAt ? new Date(t.saleStartsAt) : null,
        saleEndsAt: t.saleEndsAt ? new Date(t.saleEndsAt) : null,
      })),
    );
    return (await loadEvents(tx, eq(events.id, id)))[0]!;
  });
}

/** Count one view of an event's page, for its organizer's dashboard. Never fails the page. */
export async function recordView(db: Db, eventId: string, now: number) {
  try {
    await db
      .insert(eventViews)
      .values({ eventId, day: eatDay(now), count: 1 })
      .onConflictDoUpdate({
        target: [eventViews.eventId, eventViews.day],
        set: { count: sql`${eventViews.count} + 1` },
      });
  } catch (error) {
    console.error(`Counting a view of ${eventId} failed`, error);
  }
}
