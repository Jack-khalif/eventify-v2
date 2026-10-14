import { formatPhone } from './phone';
import type { Attendee } from './schemas';

/** "+254712345678" → "•••• 678": enough to tell two Wanjirus apart on a printed sheet. */
export const maskPhone = (phone: string) => (phone ? `•••• ${phone.slice(-3)}` : '');

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The guest list as CSV for Excel or Google Sheets. Starts with a byte-order mark so Excel reads
 * names with accents correctly; cells that look like formulas are defused (a name like "=1+1"
 * would otherwise run in the organizer's spreadsheet).
 */
export function attendeesCsv(
  attendees: readonly Attendee[],
  checkedInLabel: (iso: string) => string,
) {
  const rows = [
    ['Name', 'Ticket code', 'Tier', 'Type', 'Email', 'Phone', 'Checked in'],
    ...attendees.map((a) => [
      a.name,
      a.code,
      a.tierName,
      a.kind === 'comp' ? 'Complimentary' : 'Bought',
      a.email,
      // Spaced, so Excel keeps it as text instead of showing 2.54712E+11.
      formatPhone(a.phone),
      a.checkedInAt ? checkedInLabel(a.checkedInAt) : '',
    ]),
  ];
  // A phone number is digits and spaces after its plus sign, so it can't be a formula.
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) && !/^\+[\d ]+$/.test(v) ? `'${v}` : v);
  return `\uFEFF${rows.map((r) => r.map((v) => csvCell(safe(v))).join(',')).join('\r\n')}\r\n`;
}
