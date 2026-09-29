import {
  generatePassSecret,
  toEatIso,
  type DoorGuest,
  type DoorList,
  type DoorSyncRequest,
  type PublicEvent,
} from '@eventify/shared';
import { doors as sampleDoors, guests as sampleGuests } from '@eventify/shared/fixtures';
import { DEV_QR_PUBLIC_KEY } from './devKeys';
import { recordTicketCheckIn, ticketsForEvent } from './orders';

/**
 * In-browser stand-in for door check-in until the backend exists: hands out the guest list for
 * a check-in link and merges check-ins synced from door devices (the earliest one wins).
 */

type Record_ = { at: string; door: string };
type Db = {
  /** Check-ins on the design's sample guests, by ticket id. */
  sample: Record<string, Record_>;
  /** Every check-in made through a scanner, per event, for the dashboard's door counts. */
  log: Record<string, (Record_ & { ticketId: string })[]>;
  /** Door names devices have picked, per event. */
  doors: Record<string, string[]>;
};

const STORAGE_KEY = 'eventify-mock-checkins';
const SAMPLE_EVENT_ID = 'evt_sauti';
let db: Db = load();

function empty(): Db {
  return { sample: {}, log: {}, doors: {} };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    // Storage blocked or corrupt: start fresh for this visit.
  }
  return empty();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Not persisted; fine for a mock.
  }
}

export function resetCheckIns() {
  db = empty();
}

/** Sample guests have no Live Pass, so any secret will do; they're found by QR or search. */
const sampleSecrets = new Map(sampleGuests.map((g) => [g.ticketId, generatePassSecret()]));

function guestsFor(event: PublicEvent): DoorGuest[] {
  const samples: DoorGuest[] =
    event.id === SAMPLE_EVENT_ID
      ? sampleGuests.map((g) => {
          const c = db.sample[g.ticketId];
          return {
            ...g,
            passSecret: sampleSecrets.get(g.ticketId)!,
            ...(c && !g.checkedInAt ? { checkedInAt: c.at, checkedInDoor: c.door } : {}),
          };
        })
      : [];
  const sold = ticketsForEvent(event.id).map(({ ticket, order }) => ({
    ticketId: ticket.id,
    code: ticket.code,
    name: ticket.holderName,
    phone: order.buyer.phone,
    tierName: event.tiers.find((t) => t.id === order.tierId)?.name ?? '',
    checkedInAt: ticket.checkedInAt,
    checkedInDoor: ticket.checkedInDoor ?? null,
    passSecret: ticket.secret,
  }));
  return [...samples, ...sold];
}

export function doorList(event: PublicEvent, checkinCode: string, now = Date.now()): DoorList {
  const names = new Set([
    ...sampleDoors.filter((d) => d.eventId === event.id).map((d) => d.name),
    ...(db.doors[event.id] ?? []),
  ]);
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
    doors: [...names],
    guests: guestsFor(event),
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: DEV_QR_PUBLIC_KEY.x! },
    downloadedAt: toEatIso(now),
  };
}

export function syncDoor(
  event: PublicEvent,
  checkinCode: string,
  req: DoorSyncRequest,
  now = Date.now(),
): DoorList {
  const door = req.door.trim();
  const known = db.doors[event.id] ?? [];
  if (!known.includes(door)) db.doors[event.id] = [...known, door];

  const guests = guestsFor(event);
  for (const c of req.checkIns) {
    const guest = guests.find((g) => g.ticketId === c.ticketId);
    // Unknown tickets are ignored; a later duplicate loses to the check-in already recorded.
    if (!guest || (guest.checkedInAt && Date.parse(guest.checkedInAt) <= Date.parse(c.at))) {
      continue;
    }
    if (sampleSecrets.has(c.ticketId)) db.sample[c.ticketId] = { at: c.at, door };
    else recordTicketCheckIn(c.ticketId, c.at, door);
    const log = (db.log[event.id] ?? []).filter((l) => l.ticketId !== c.ticketId);
    db.log[event.id] = [...log, { ticketId: c.ticketId, at: c.at, door }];
    guest.checkedInAt = c.at;
  }
  save();
  return doorList(event, checkinCode, now);
}

/** Check-ins recorded through scanners for this event. */
export const scannerCheckIns = (eventId: string) => db.log[eventId] ?? [];
