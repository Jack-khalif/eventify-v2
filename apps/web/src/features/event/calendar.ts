import {
  buildCalendarFile,
  googleCalendarUrl,
  outlookCalendarUrl,
  type PublicEvent,
} from '@eventify/shared';
import { siteUrl } from '../../lib/site';

const eventPageUrl = (event: PublicEvent) => siteUrl(`/e/${event.slug}`);

export const googleCalendarLink = (event: PublicEvent) =>
  googleCalendarUrl(event, eventPageUrl(event));

export const outlookCalendarLink = (event: PublicEvent) =>
  outlookCalendarUrl(event, eventPageUrl(event));

/** For Apple Calendar and anything else: an .ics file the device opens in its calendar app. */
export function downloadCalendarFile(event: PublicEvent) {
  const ics = buildCalendarFile(event, eventPageUrl(event));
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.slug}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The organizer's exact Google Maps pin when they set one, otherwise a search for the venue. */
export const directionsUrl = (event: PublicEvent) =>
  event.mapUrl ??
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [event.venue, event.address].filter(Boolean).join(', '),
  )}`;
