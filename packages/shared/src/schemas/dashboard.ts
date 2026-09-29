import { z } from 'zod';
import { currencySchema } from '../enums';
import { idSchema, moneySchema, rateBpsSchema } from './common';

export const organizerDashboardSchema = z.object({
  eventId: idSchema,
  currency: currencySchema,
  rateBps: rateBpsSchema,
  ticketsSold: z.int().nonnegative(),
  grossMinor: moneySchema,
  checkIns: z.int().nonnegative(),
  capacity: z.int().nonnegative(),
  pageViews: z.int().nonnegative(),
  pageViewsThisWeek: z.int().nonnegative(),
  /** Oldest first, 14 entries. */
  dailySales: z.array(z.int().nonnegative()).length(14),
  tierSales: z.array(z.object({ name: z.string(), sold: z.int(), revenueMinor: moneySchema })),
  doors: z.array(z.object({ doorId: idSchema, name: z.string(), count: z.int().nonnegative() })),
});
export type OrganizerDashboard = z.infer<typeof organizerDashboardSchema>;
