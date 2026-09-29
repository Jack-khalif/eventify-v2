import { toMinor } from '../money';
import type { OrganizerDashboard } from '../schemas';

/** Numbers as shown on the design's organizer dashboard for Sauti Sessions. */
export const sautiDashboard: OrganizerDashboard = {
  eventId: 'evt_sauti',
  currency: 'KES',
  rateBps: 450,
  ticketsSold: 602,
  grossMinor: toMinor(452_600),
  checkIns: 231,
  capacity: 400,
  pageViews: 4180,
  pageViewsThisWeek: 320,
  dailySales: [3, 5, 4, 8, 12, 9, 15, 18, 14, 22, 27, 19, 31, 24],
  tierSales: [
    { name: 'VIP', sold: 18, revenueMinor: toMinor(54_000) },
    { name: 'Regular', sold: 210, revenueMinor: toMinor(252_000) },
    { name: 'Student', sold: 84, revenueMinor: toMinor(50_400) },
  ],
  doors: [
    { doorId: 'door_main', name: 'Main Gate', count: 142 },
    { doorId: 'door_side', name: 'Side Gate', count: 38 },
    { doorId: 'door_aisha', name: 'Volunteer — Aisha K.', count: 51 },
  ],
};
