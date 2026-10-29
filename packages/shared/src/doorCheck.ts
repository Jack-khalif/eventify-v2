import { verifyTicketQr } from './passes';
import type { DoorGuest, DoorTransferred } from './schemas';

/**
 * What the door scanner decides, entirely on the device so it works without internet.
 * The same rules decide which check-in counts when devices sync: the earliest one wins.
 */

export type DoorResult =
  | { kind: 'valid'; guest: DoorGuest }
  | { kind: 'used'; guest: DoorGuest }
  | { kind: 'invalid'; reason: 'not_a_ticket' | 'other_event' | 'transferred' };

const resultFor = (guest: DoorGuest): DoorResult =>
  guest.checkedInAt ? { kind: 'used', guest } : { kind: 'valid', guest };

/**
 * A scanned backup QR: forged or unreadable → not a ticket; one that was passed on → transferred;
 * genuine but not on this list → other event.
 */
export async function checkQr(
  payload: string,
  guests: readonly DoorGuest[],
  verifyKey: CryptoKey,
  transferred: readonly DoorTransferred[] = [],
): Promise<DoorResult> {
  const ticketId = await verifyTicketQr(verifyKey, payload);
  if (!ticketId) return { kind: 'invalid', reason: 'not_a_ticket' };
  const guest = guests.find((g) => g.ticketId === ticketId);
  if (guest) return resultFor(guest);
  return transferred.some((t) => t.ticketId === ticketId)
    ? { kind: 'invalid', reason: 'transferred' }
    : { kind: 'invalid', reason: 'other_event' };
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Manual lookup by name, phone (07… or +254…) or ticket code. Unchecked guests first, then by name. */
export function searchGuests(guests: readonly DoorGuest[], query: string, limit = 20) {
  const q = query.trim().toLowerCase();
  const qDigits = digits(q).replace(/^0/, '');
  return guests
    .filter(
      (g) =>
        !q ||
        g.name.toLowerCase().includes(q) ||
        g.code.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && digits(g.phone).includes(qDigits)),
    )
    .sort(
      (a, b) =>
        Number(a.checkedInAt !== null) - Number(b.checkedInAt !== null) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Mark a guest checked in. If they already are, the earlier check-in stands. */
export function applyCheckIn(
  guests: readonly DoorGuest[],
  ticketId: string,
  at: string,
  door: string,
): DoorGuest[] {
  return guests.map((g) =>
    g.ticketId !== ticketId || (g.checkedInAt && Date.parse(g.checkedInAt) <= Date.parse(at))
      ? g
      : { ...g, checkedInAt: at, checkedInDoor: door },
  );
}
