import type { EventStatus } from './enums';
import type { Event } from './schemas';

/**
 * Tickets sold, gross and per-tier sales, counted from the event's tiers so the numbers always agree.
 * A tier counts purchases; a group purchase is several tickets, so tickets and capacity scale by admits.
 */
export function salesSummary(e: Pick<Event, 'tiers'>) {
  const tierSales = e.tiers.map((t) => ({
    name: t.name,
    sold: t.sold * t.admits,
    revenueMinor: t.sold * t.priceMinor,
  }));
  return {
    ticketsSold: tierSales.reduce((sum, t) => sum + t.sold, 0),
    grossMinor: tierSales.reduce((sum, t) => sum + t.revenueMinor, 0),
    /** Total of capped tiers; 0 when every tier is unlimited. */
    capacity: e.tiers.reduce((sum, t) => sum + (t.quantity ?? 0) * t.admits, 0),
    tierSales,
  };
}

/** Sum of the most recent `days` entries of an oldest-first daily series. */
export const lastDays = (daily: readonly number[], days: number) =>
  daily.slice(-days).reduce((sum, n) => sum + n, 0);

/** A live event whose end time has passed shows as ended. */
export function displayStatus(e: Pick<Event, 'status' | 'endsAt'>, now = new Date()): EventStatus {
  return e.status === 'live' && Date.parse(e.endsAt) <= now.getTime() ? 'ended' : e.status;
}
