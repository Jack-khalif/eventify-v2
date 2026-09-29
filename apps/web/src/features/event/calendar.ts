import { buildCalendarFile, type PublicEvent } from '@eventify/shared';
import { siteUrl } from '../../lib/site';

/** Downloads an .ics file; phones and desktop calendars open it directly. */
export function downloadCalendarFile(event: PublicEvent) {
  const ics = buildCalendarFile(event, siteUrl(`/e/${event.slug}`));
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.slug}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export const directionsUrl = (event: PublicEvent) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [event.venue, event.address].filter(Boolean).join(', '),
  )}`;
