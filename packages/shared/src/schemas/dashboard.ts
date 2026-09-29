import { z } from 'zod';
import { coverToneSchema, currencySchema, eventStatusSchema } from '../enums';
import {
  dateTimeSchema,
  idSchema,
  imageUrlSchema,
  moneySchema,
  rateBpsSchema,
  slugSchema,
} from './common';
import { organizerSummarySchema } from './organizer';

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

/** An event in the organizer's "My events" list. */
export const organizerEventRowSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  status: eventStatusSchema,
  coverTone: coverToneSchema,
  coverImageUrl: imageUrlSchema.nullable(),
  ticketsSold: z.int().nonnegative(),
});
export type OrganizerEventRow = z.infer<typeof organizerEventRowSchema>;

/** GET /api/organizer/me: who is signed in, their rate and their events (soonest first). */
export const organizerHomeSchema = z.object({
  organizer: organizerSummarySchema.extend({ rateBps: rateBpsSchema }),
  events: z.array(organizerEventRowSchema),
});
export type OrganizerHome = z.infer<typeof organizerHomeSchema>;

/** GET /api/organizer/events/:id/dashboard */
export const eventDashboardSchema = organizerDashboardSchema.extend({
  title: z.string().min(1),
  slug: slugSchema,
  /** Door staff open eventify.co/checkin/{code} to scan for this event. */
  checkinCode: z.string().regex(/^[a-z0-9-]{4,40}$/),
});
export type EventDashboard = z.infer<typeof eventDashboardSchema>;
