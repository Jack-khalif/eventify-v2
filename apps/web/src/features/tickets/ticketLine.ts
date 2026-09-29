import type { TicketView } from '@eventify/shared';

/** "Regular" or "Regular · 1 of 2" when the order has several tickets. */
export const ticketLine = (t: TicketView) =>
  t.count > 1 ? `${t.tierName} · ${t.index} of ${t.count}` : t.tierName;
