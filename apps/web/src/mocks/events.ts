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
} from '@eventify/shared';
import { organizers, publicEvents, sautiDashboard } from '@eventify/shared/fixtures';

/**
 * In-browser stand-in for events organizers create, until the backend exists. Created events are
 * kept in localStorage so they survive a refresh and show up on Discover like any other event.
 */

/** Until sign-in (Phase A9), the organizer screens act as this organizer. */
export const DEMO_ORGANIZER_ID = 'org_amani';

const STORAGE_KEY = 'eventify-mock-events';
let created: Event[] = load();

function load(): Event[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Event[];
  } catch {
    // Storage blocked or corrupt: start fresh for this visit.
  }
  return [];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
  } catch {
    // Not persisted (a large poster can exceed the quota); fine for a mock.
  }
}

export function resetEvents() {
  created = [];
}

const withOrganizer = (e: Event): PublicEvent => {
  const o = organizers.find((org) => org.id === e.organizerId)!;
  return {
    ...e,
    organizer: { id: o.id, handle: o.handle, name: o.name, type: o.type, verified: o.verified },
  };
};

/** Sample events plus everything created in this browser. */
export const allEvents = (): PublicEvent[] => [...publicEvents(), ...created.map(withOrganizer)];

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
  save();
  return withOrganizer(event);
}

const ownEvents = (organizerId: string) =>
  allEvents()
    .filter((e) => e.organizerId === organizerId)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

export function organizerHome(organizerId: string, now = new Date()): OrganizerHome {
  const o = organizers.find((org) => org.id === organizerId)!;
  return {
    organizer: {
      id: o.id,
      handle: o.handle,
      name: o.name,
      type: o.type,
      verified: o.verified,
      rateBps: o.rateBps,
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

/** Short, readable door code: "sauti-a92f". */
function checkinCode(e: Event) {
  if (e.id === sautiDashboard.eventId) return 'sauti-a92f';
  let h = 0;
  for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const word = e.slug.split('-')[0]!.slice(0, 12);
  return `${word}-${h.toString(16).padStart(4, '0').slice(-4)}`;
}

/** Null when the event doesn't exist or belongs to another organizer. */
export function eventDashboard(organizerId: string, eventId: string): EventDashboard | null {
  const e = ownEvents(organizerId).find((x) => x.id === eventId);
  if (!e) return null;
  const o = organizers.find((org) => org.id === organizerId)!;
  // Traffic, daily sales and door counts only exist for the design's sample event.
  const traffic =
    e.id === sautiDashboard.eventId
      ? sautiDashboard
      : {
          checkIns: 0,
          pageViews: 0,
          pageViewsThisWeek: 0,
          dailySales: Array<number>(14).fill(0),
          doors: [],
        };
  return {
    ...salesSummary(e),
    eventId: e.id,
    title: e.title,
    slug: e.slug,
    currency: e.currency,
    rateBps: o.rateBps,
    checkIns: traffic.checkIns,
    pageViews: traffic.pageViews,
    pageViewsThisWeek: traffic.pageViewsThisWeek,
    dailySales: traffic.dailySales,
    doors: traffic.doors,
    checkinCode: checkinCode(e),
  };
}
