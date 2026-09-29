import { z } from 'zod';
import { payoutMethodSchema, payoutStatusSchema } from '../enums';
import { dateTimeSchema, idSchema, moneySchema, rateBpsSchema } from './common';

export const agentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
});
export type Agent = z.infer<typeof agentSchema>;

export const rateChangeSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  oldBps: rateBpsSchema,
  newBps: rateBpsSchema,
  reason: z.string().min(1),
  changedBy: z.string().min(1),
  at: dateTimeSchema,
  /** Set when the change applies to one upcoming event only. */
  eventId: idSchema.nullable(),
});
export type RateChange = z.infer<typeof rateChangeSchema>;

export const rateApprovalSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  agentId: idSchema,
  requestedBps: rateBpsSchema,
  reason: z.string().min(1),
  requestedAt: dateTimeSchema,
  status: z.enum(['pending', 'approved', 'rejected']),
});
export type RateApproval = z.infer<typeof rateApprovalSchema>;

export const payoutSchema = z.object({
  id: idSchema,
  organizerId: idSchema,
  amountMinor: moneySchema,
  method: payoutMethodSchema,
  status: payoutStatusSchema,
});
export type Payout = z.infer<typeof payoutSchema>;
