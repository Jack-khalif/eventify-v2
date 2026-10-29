import type {
  AdminMerchRow,
  MerchRequest,
  MerchRequestRow,
  MerchStatusChange,
  Organizer,
  PublicEvent,
} from '@eventify/shared';

/**
 * In-browser stand-in for merch requests and the print queue. Kept for this visit only; nothing is
 * emailed to the team.
 */

type Stored = { row: MerchRequestRow; eventId: string; organizerId: string; email: string };
let requests: Stored[] = [];

export function resetMerch() {
  requests = [];
}

const iso = (ms: number) => new Date(ms).toISOString();

/** One event's requests, newest first. */
export const merchFor = (eventId: string) =>
  requests
    .filter((r) => r.eventId === eventId)
    .reverse()
    .map((r) => r.row);

export function requestMerch(
  event: PublicEvent,
  organizer: Organizer,
  email: string,
  req: MerchRequest,
  now = Date.now(),
) {
  requests.push({
    eventId: event.id,
    organizerId: organizer.id,
    email,
    row: {
      id: `mer_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      items: req.items,
      brandingNotes: req.brandingNotes,
      status: 'received',
      opsNote: '',
      createdAt: iso(now),
      updatedAt: iso(now),
    },
  });
  return merchFor(event.id);
}

const DONE = new Set(['delivered', 'cancelled']);

/** The print queue, ordered as the API orders it: open requests by event date, then the rest. */
export function merchQueue(
  events: PublicEvent[],
  organizerOf: (id: string) => Organizer | undefined,
): AdminMerchRow[] {
  const rows = requests.flatMap((r): AdminMerchRow[] => {
    const event = events.find((e) => e.id === r.eventId);
    const organizer = organizerOf(r.organizerId);
    if (!event || !organizer) return [];
    return [
      {
        ...r.row,
        organizer: { name: organizer.name, handle: organizer.handle, email: r.email },
        event: { id: event.id, title: event.title, startsAt: event.startsAt },
      },
    ];
  });
  return rows.sort(
    (a, b) =>
      Number(DONE.has(a.status)) - Number(DONE.has(b.status)) ||
      (DONE.has(a.status)
        ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        : Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt)),
  );
}

export function setMerchStatus(id: string, change: MerchStatusChange, now = Date.now()) {
  const r = requests.find((x) => x.row.id === id)?.row;
  if (!r) return undefined;
  r.status = change.status;
  if (change.note) r.opsNote = change.note;
  r.updatedAt = iso(now);
  return r.id;
}
