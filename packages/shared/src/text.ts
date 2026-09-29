import { formatTimeRange } from './dates';
import type { PublicEvent } from './schemas';

/** "Amani Wanjiru" → "AW", "IEEE Strathmore Student Branch" → "IS": first two capitalised words, as in the design. */
export function initials(name: string): string {
  const capitalised = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  const words = capitalised.length > 0 ? capitalised : name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Shown when an organizer hasn't written a description yet (from the design). */
export function eventDescription(e: PublicEvent): string[] {
  if (e.description.length > 0) return e.description;
  return [
    `${e.title} by ${e.organizer.name}. ${formatTimeRange(e.startsAt, e.endsAt)} at ${e.venue}.`,
    'Tickets are delivered by SMS and email with a QR code and Express Entry Live Pass for quick entry at the door.',
  ];
}
