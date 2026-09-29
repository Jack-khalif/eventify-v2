import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common';
import { publicEventSchema } from './event';

/** EVT-SAUTI-0412: human-readable reference printed on the ticket and SMS. Not a secret. */
export const ticketCodeSchema = z.string().regex(/^EVT-[A-Z0-9]+-\d{4,}$/);

export const ticketSchema = z.object({
  id: idSchema,
  code: ticketCodeSchema,
  orderId: idSchema,
  eventId: idSchema,
  tierId: idSchema,
  holderName: z.string().min(1),
  checkedInAt: dateTimeSchema.nullable(),
  checkedInDoorId: idSchema.nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const doorSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  /** "Main Gate", or a volunteer's name. */
  name: z.string().min(1),
});
export type Door = z.infer<typeof doorSchema>;

export const checkInSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  doorId: idSchema,
  at: dateTimeSchema,
  /** Recorded on a device without connectivity and synced later. */
  offline: z.boolean(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

/** One row of the guest list a door device downloads. */
export const guestSchema = z.object({
  ticketId: idSchema,
  code: ticketCodeSchema,
  name: z.string().min(1),
  phone: z.string(),
  tierName: z.string(),
  checkedInAt: dateTimeSchema.nullable(),
  checkedInDoor: z.string().nullable(),
});
export type Guest = z.infer<typeof guestSchema>;

/**
 * What GET /api/tickets/:id returns: everything the Live Pass page needs. The ticket id is a long
 * random token, so the /t/{id} link works like the ticket itself (as a PDF ticket would).
 */
export const ticketViewSchema = z.object({
  id: idSchema,
  code: ticketCodeSchema,
  holderName: z.string().min(1),
  tierName: z.string(),
  /** 1-based position in the order, for "Ticket 1 of 2". */
  index: z.int().positive(),
  count: z.int().positive(),
  event: publicEventSchema,
  /** Seeds the rotating live code. Only ever sent to whoever holds the ticket link. */
  passSecret: z.string().min(16),
  /** Signed text for the backup QR. */
  qrPayload: z.string().startsWith('EVT1.'),
  checkedInAt: dateTimeSchema.nullable(),
});
export type TicketView = z.infer<typeof ticketViewSchema>;

/** "Find my tickets": step 1 sends a one-time SMS code, step 2 exchanges it for the tickets. */
export const ticketLookupStartSchema = z.object({ phone: z.string().regex(/^\+\d{9,15}$/) });
export const ticketLookupStartResultSchema = z.object({ sent: z.boolean() });
export const ticketLookupVerifySchema = z.object({
  phone: z.string().regex(/^\+\d{9,15}$/),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export const ticketLookupResultSchema = z.object({ tickets: z.array(ticketViewSchema) });
