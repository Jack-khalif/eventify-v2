import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common';

/** Complimentary tickets one request can issue: a guest list, not a giveaway to the whole city. */
export const MAX_COMPS_PER_REQUEST = 20;

/** POST /api/organizer/events/:id/comps: free tickets for one person, emailed like a purchase. */
export const compRequestSchema = z.object({
  tierId: idSchema,
  quantity: z.int().min(1).max(MAX_COMPS_PER_REQUEST),
  name: z.string().trim().min(2, 'Enter their name').max(80),
  email: z.email('Enter a valid email'),
  /**
   * Optional, E.164 (normalise with normalizePhone()). With it the guest can also find the tickets
   * by phone, and door staff can search for them by number.
   */
  phone: z
    .string()
    .regex(/^\+\d{9,15}$/, 'Enter a valid phone number')
    .nullish(),
});
export type CompRequest = z.infer<typeof compRequestSchema>;

/** One complimentary issue on the dashboard's list. */
export const compRowSchema = z.object({
  name: z.string(),
  email: z.string(),
  tierName: z.string(),
  quantity: z.int().positive(),
  issuedAt: dateTimeSchema,
  /** The tickets email has gone out. */
  emailed: z.boolean(),
});
export type CompRow = z.infer<typeof compRowSchema>;

/**
 * GET /api/organizer/events/:id/comps (and the reply to issuing some): the comps so far, newest
 * first, and the tiers they can come from with how many tickets each has left (null = no cap).
 */
export const compListSchema = z.object({
  comps: z.array(compRowSchema),
  tiers: z.array(
    z.object({ id: idSchema, name: z.string(), remaining: z.int().nonnegative().nullable() }),
  ),
});
export type CompList = z.infer<typeof compListSchema>;
