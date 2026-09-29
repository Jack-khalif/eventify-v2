/**
 * Everything is shown in East Africa Time. EAT is UTC+3 all year (no daylight saving),
 * which keeps week/weekend arithmetic simple.
 */
export const EVENT_TIME_ZONE = 'Africa/Nairobi';
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TIME_ZONE, ...options });

const weekdayFmt = fmt({ weekday: 'short' });
const dayFmt = fmt({ day: '2-digit' });
const monthFmt = fmt({ month: 'short' });
const dateFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: EVENT_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

/** Newer ICU puts a narrow no-break space before AM/PM; normalise so text matches everywhere. */
const NBSP = new RegExp('[\\u202f\\u00a0]', 'g');
const clean = (s: string) => s.replace(NBSP, ' ').replace(/,/g, '');

/** "Fri" */
export const formatWeekday = (iso: string) => clean(weekdayFmt.format(new Date(iso)));
/** "02" */
export const formatDayNumber = (iso: string) => clean(dayFmt.format(new Date(iso)));
/** "Oct" */
export const formatMonth = (iso: string) => clean(monthFmt.format(new Date(iso)));
/** "Fri 2 Oct" */
export const formatDate = (iso: string) => clean(dateFmt.format(new Date(iso)));
/** "7:00 PM" */
export const formatTime = (iso: string) => clean(timeFmt.format(new Date(iso)));
/** "7:00 PM – 1:00 AM" */
export const formatTimeRange = (startIso: string, endIso: string) =>
  `${formatTime(startIso)} – ${formatTime(endIso)}`;

/**
 * The weekend to feature on Discover: Friday 00:00 to Monday 00:00 EAT.
 * Monday–Friday it's the coming weekend; on Saturday or Sunday it's the current one.
 */
export function upcomingWeekend(now: Date = new Date()): {
  from: string;
  to: string;
  label: string;
} {
  const eat = new Date(now.getTime() + EAT_OFFSET_MS);
  const midnightEat = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate());
  const weekday = eat.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const daysToFriday = weekday === 6 ? -1 : weekday === 0 ? -2 : 5 - weekday;

  const fridayEat = midnightEat + daysToFriday * DAY_MS;
  const from = new Date(fridayEat - EAT_OFFSET_MS);
  const to = new Date(fridayEat + 3 * DAY_MS - EAT_OFFSET_MS);
  const sunday = new Date(to.getTime() - 1).toISOString();

  const sameMonth = formatMonth(from.toISOString()) === formatMonth(sunday);
  const fri = sameMonth
    ? `Fri ${Number(formatDayNumber(from.toISOString()))}`
    : formatDate(from.toISOString());
  const label = `${fri} – ${formatDate(sunday)}`;

  return { from: from.toISOString(), to: to.toISOString(), label };
}
