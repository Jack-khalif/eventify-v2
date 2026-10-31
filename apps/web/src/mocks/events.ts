import {
  CATEGORY_TONE,
  CITY_CURRENCY,
  displayStatus,
  salesSummary,
  slugify,
  type CreateEventRequest,
  type Event,
  type EventDashboard,
  type OrganizerHome,
  type PublicEvent,
  type UpdateEventRequest,
} from '@eventify/shared';
import { publicEvents, sautiDashboard } from '@eventify/shared/fixtures';
import { compsIssued } from './orders';
import { findOrganizer } from './organizers';
import { eventRate, organizerRate } from './rates';

/**
 * In-browser stand-in for events organizers create, until the backend exists. Created events are
 * kept in localStorage so they survive a refresh and show up on Discover like any other event.
 */

const STORAGE_KEY = 'eventify-mock-events';
const UPDATED_KEY = 'eventify-mock-updated-events';
const CODES_KEY = 'eventify-mock-checkin-codes';
let created: Event[] = load(STORAGE_KEY, []);
let updated: Event[] = load(UPDATED_KEY, []);
/** Door check-in codes for created events, by event id. */
let codes: Record<string, string> = load(CODES_KEY, {});
/** Sample events an organizer deleted, for this visit only. */
let deleted = new Set<string>();

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Storage blocked or corrupt: start fresh for this visit.
  }
  return fallback;
}

function save() {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(codes));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
    localStorage.setItem(UPDATED_KEY, JSON.stringify(updated));
  } catch {
    // Not persisted (a large poster can exceed the quota); fine for a mock.
  }
}

export function resetEvents() {
  created = [];
  updated = [];
  codes = {};
  deleted = new Set();
}

const withOrganizer = (e: Event): PublicEvent => {
  const o = findOrganizer(e.organizerId)!;
  return {
    ...e,
    organizer: { id: o.id, handle: o.handle, name: o.name, type: o.type, verified: o.verified },
  };
};

/** Sample events plus everything created in this browser. */
export const allEvents = (): PublicEvent[] =>
  [
    ...publicEvents().map((event) => updated.find((item) => item.id === event.id) ?? event),
    ...created,
  ]
    .map(withOrganizer)
    .filter((e) => !deleted.has(e.id));

function uniqueSlug(title: string) {
  const base = slugify(title);
  const taken = new Set(allEvents().map((e) => e.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function createEvent(req: CreateEventRequest, organizerId: string): PublicEvent {
  // Letters and digits only: ticket codes are built from it (EVT-{ID}-0001).
  const id = `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const event: Event = {
    ...req,
    id,
    slug: uniqueSlug(req.title),
    currency: CITY_CURRENCY[req.city],
    address: '',
    mapUrl: null,
    coverTone: CATEGORY_TONE[req.category],
    organizerId,
    status: 'live',
    tiers: req.tiers.map((t, i) => ({ ...t, id: `tier_${id}_${i + 1}`, sold: 0 })),
  };
  created.push(event);
  // The link is the door staff's only credential, so the code must be unguessable (48 random bits).
  codes[id] =
    `${event.slug.split('-')[0]!.slice(0, 12)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  save();
  return withOrganizer(event);
}

export function updateEvent(
  req: UpdateEventRequest,
  organizerId: string,
  eventId: string,
): PublicEvent | { failureStatus: 409; error: string; message: string } | null {
  const event = allEvents().find((item) => item.id === eventId && item.organizerId === organizerId);
  if (!event) return null;
  const existing = new Map(event.tiers.map((tier) => [tier.id, tier]));
  const ids = req.tiers.flatMap((tier) => (tier.id ? [tier.id] : []));
  if (new Set(ids).size !== ids.length || ids.some((id) => !existing.has(id))) {
    return {
      failureStatus: 409,
      error: 'invalid_tier',
      message: 'Refresh the page and try again.',
    };
  }
  for (const tier of event.tiers) {
    if (!ids.includes(tier.id) && tier.sold > 0) {
      return {
        failureStatus: 409,
        error: 'tier_has_orders',
        message: `${tier.name} has order history and can't be removed. You can still edit its details.`,
      };
    }
  }
  for (const input of req.tiers) {
    const old = input.id ? existing.get(input.id) : undefined;
    if (old && input.quantity !== null && input.quantity < old.sold) {
      return {
        failureStatus: 409,
        error: 'tier_capacity_too_low',
        message: `${old.name} must have capacity for its ${old.sold} sold tickets.`,
      };
    }
  }
  const tiers: Event['tiers'] = req.tiers.map((input) => {
    const old = input.id ? existing.get(input.id) : undefined;
    return {
      id: old?.id ?? `tier_${eventId}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      name: input.name,
      note: input.note,
      priceMinor: input.priceMinor,
      quantity: input.quantity,
      sold: old?.sold ?? 0,
      saleStartsAt: input.saleStartsAt,
      saleEndsAt: input.saleEndsAt,
    };
  });
  const result: Event = {
    ...event,
    title: req.title,
    category: req.category,
    city: req.city,
    currency: CITY_CURRENCY[req.city],
    venue: req.venue,
    startsAt: req.startsAt,
    endsAt: req.endsAt,
    description: req.description,
    coverTone: CATEGORY_TONE[req.category],
    coverImageUrl: req.coverImageUrl,
    tiers,
  };
  const sampleEvent = publicEvents().some((item) => item.id === eventId);
  if (sampleEvent) updated = [...updated.filter((item) => item.id !== eventId), result];
  else created = [...created.filter((item) => item.id !== eventId), result];
  save();
  return withOrganizer(result);
}

const ownEvents = (organizerId: string) =>
  allEvents()
    .filter((e) => e.organizerId === organizerId)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

export function organizerHome(organizerId: string, now = new Date()): OrganizerHome {
  const o = findOrganizer(organizerId)!;
  return {
    organizer: {
      id: o.id,
      handle: o.handle,
      name: o.name,
      type: o.type,
      verified: o.verified,
      rateBps: organizerRate(o.id),
    },
    events: ownEvents(organizerId).map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: displayStatus(e, now),
      coverTone: e.coverTone,
      coverImageUrl: e.coverImageUrl,
      ticketsSold: salesSummary(e).ticketsSold,
    })),
  };
}

/**
 * Take an event down, as the API does: only its own organizer can, and only while no tickets have
 * been issued. Null when there is no such event of theirs.
 */
export function deleteEvent(
  organizerId: string,
  eventId: string,
): { ticketsIssued: number } | null {
  const e = ownEvents(organizerId).find((x) => x.id === eventId);
  if (!e) return null;
  const ticketsIssued = salesSummary(e).ticketsSold;
  if (ticketsIssued === 0) {
    created = created.filter((x) => x.id !== eventId);
    delete codes[eventId];
    deleted.add(eventId);
    save();
  }
  return { ticketsIssued };
}

/**
 * Take down everything an organizer posted, when they delete their profile. Like the API, all of it
 * or none: nothing goes while any of their events has tickets out.
 */
export function deleteOrganizerEvents(organizerId: string): { ticketsIssued: number } {
  const own = ownEvents(organizerId);
  const ticketsIssued = own.reduce((sum, e) => sum + salesSummary(e).ticketsSold, 0);
  if (ticketsIssued === 0) {
    for (const e of own) {
      delete codes[e.id];
      deleted.add(e.id);
    }
    created = created.filter((e) => e.organizerId !== organizerId);
    save();
  }
  return { ticketsIssued };
}

/** Door code for an event: random for created events; fixed for the samples ("sauti-a92f", from the design). */
function checkinCode(e: Event): string {
  const stored = codes[e.id];
  if (stored) return stored;
  if (e.id === sautiDashboard.eventId) return 'sauti-a92f';
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const word = e.slug.split('-')[0]!.slice(0, 12);
  return `${word}-${h.toString(16).padStart(4, '0').slice(-4)}`;
}

export const eventForCheckinCode = (code: string) =>
  allEvents().find((e) => checkinCode(e) === code);

/**
 * Null when the event doesn't exist or belongs to another organizer. `doorCheckIns` are the
 * check-ins recorded through the scanner, added on top of the sample numbers.
 */
export function eventDashboard(
  organizerId: string,
  eventId: string,
  doorCheckIns: readonly { door: string }[] = [],
): EventDashboard | null {
  const e = ownEvents(organizerId).find((x) => x.id === eventId);
  if (!e) return null;
  const o = findOrganizer(organizerId)!;
  // Traffic, daily sales and door counts only exist for the design's sample event.
  const traffic =
    e.id === sautiDashboard.eventId
      ? sautiDashboard
      : {
          checkIns: 0,
          pageViews: 0,
          pageViewsThisWeek: 0,
          dailySales: Array<number>(14).fill(0),
          doors: [] as EventDashboard['doors'],
        };
  const doors = traffic.doors.map((d) => ({ ...d }));
  for (const { door } of doorCheckIns) {
    const row = doors.find((d) => d.name === door);
    if (row) row.count += 1;
    else doors.push({ doorId: `door_${slugify(door)}`, name: door, count: 1 });
  }
  return {
    ...salesSummary(e),
    eventId: e.id,
    title: e.title,
    slug: e.slug,
    currency: e.currency,
    rateBps: eventRate(o.id, e.id),
    compsIssued: compsIssued(e.id),
    checkIns: traffic.checkIns + doorCheckIns.length,
    pageViews: traffic.pageViews,
    pageViewsThisWeek: traffic.pageViewsThisWeek,
    dailySales: traffic.dailySales,
    doors,
    checkinCode: checkinCode(e),
  };
}
