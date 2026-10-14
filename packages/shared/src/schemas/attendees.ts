import { z } from 'zod';
import { orderKindSchema } from '../enums';
import { dateTimeSchema, idSchema } from './common';
import { ticketCodeSchema } from './ticket';

/** One ticket on an event's guest list, as its organizer sees it. */
export const attendeeSchema = z.object({
  ticketId: idSchema,
  code: ticketCodeSchema,
  /** Whoever holds the ticket now (the new holder, after a transfer). */
  name: z.string(),
  email: z.string(),
  /** Empty when we don't have one (a comp without one, or a ticket passed on). */
  phone: z.string(),
  tierName: z.string(),
  /** sale = bought; comp = given away by the organizer. */
  kind: orderKindSchema,
  checkedInAt: dateTimeSchema.nullable(),
});
export type Attendee = z.infer<typeof attendeeSchema>;

/** GET /api/organizer/events/:id/attendees: every ticket that works, by name. */
export const attendeeListSchema = z.object({
  event: z.object({
    id: idSchema,
    slug: z.string(),
    title: z.string(),
    venue: z.string(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
  }),
  attendees: z.array(attendeeSchema),
});
export type AttendeeList = z.infer<typeof attendeeListSchema>;
