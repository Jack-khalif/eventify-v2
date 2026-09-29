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

/** A guest row on a door device: includes the pass secret so live codes can be checked offline. */
export const doorGuestSchema = guestSchema.extend({ passSecret: z.string().min(16) });
export type DoorGuest = z.infer<typeof doorGuestSchema>;

/** Public half of the key that signs backup QRs (a JWK). */
export const qrVerifyKeySchema = z.object({
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string().min(1),
});

/**
 * GET /api/checkin/:code, and the reply to every sync: everything a door device needs to check
 * people in with no connection. The link itself is the credential, so codes must be unguessable.
 */
export const doorListSchema = z.object({
  checkinCode: z.string().min(4),
  event: z.object({
    id: idSchema,
    slug: z.string().min(1),
    title: z.string().min(1),
    venue: z.string(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
  }),
  /** Door names already in use, offered when a new device picks its door. */
  doors: z.array(z.string()),
  guests: z.array(doorGuestSchema),
  verifyKey: qrVerifyKeySchema,
  downloadedAt: dateTimeSchema,
});
export type DoorList = z.infer<typeof doorListSchema>;

export const doorCheckInSchema = z.object({
  ticketId: idSchema,
  at: dateTimeSchema,
  /** Recorded while the device had no connection. */
  offline: z.boolean(),
});
export type DoorCheckIn = z.infer<typeof doorCheckInSchema>;

/** POST /api/checkin/:code/sync: upload this device's check-ins, get the merged list back. */
export const doorSyncRequestSchema = z.object({
  door: z.string().trim().min(1).max(60),
  checkIns: z.array(doorCheckInSchema).max(1000),
});
export type DoorSyncRequest = z.infer<typeof doorSyncRequestSchema>;
