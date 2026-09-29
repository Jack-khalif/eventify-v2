import type { PublicEvent } from './schemas';

/** 2026-10-02T19:00:00+03:00 → 20261002T160000Z */
const icsDate = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Escape text per RFC 5545: backslash, semicolon, comma and newlines. */
const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 characters are folded with CRLF + space. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

const eventDetails = (e: PublicEvent, url: string) => `${e.organizer.name}\n${url}`;
const eventLocation = (e: PublicEvent) => [e.venue, e.address].filter(Boolean).join(', ');

/** An .ics file for "Add to calendar", also attached to ticket emails later. */
export function buildCalendarFile(e: PublicEvent, url: string, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eventify//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@eventify.co`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    `LOCATION:${icsText(eventLocation(e))}`,
    `DESCRIPTION:${icsText(eventDetails(e, url))}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Opens Google Calendar's "new event" screen, pre-filled. Works on Android and desktop. */
export function googleCalendarUrl(e: PublicEvent, url: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsDate(e.startsAt)}/${icsDate(e.endsAt)}`,
    details: eventDetails(e, url),
    location: eventLocation(e),
    ctz: 'Africa/Nairobi',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Outlook.com / Microsoft 365 web calendar, pre-filled. */
export function outlookCalendarUrl(e: PublicEvent, url: string): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: new Date(e.startsAt).toISOString(),
    enddt: new Date(e.endsAt).toISOString(),
    body: eventDetails(e, url),
    location: eventLocation(e),
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}
