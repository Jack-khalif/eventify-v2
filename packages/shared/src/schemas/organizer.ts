import { z } from 'zod';
import {
  categorySchema,
  citySchema,
  coverToneSchema,
  organizerStatusSchema,
  payoutMethodSchema,
} from '../enums';
import { handleSchema, idSchema, rateBpsSchema } from './common';

export const organizerSchema = z.object({
  id: idSchema,
  handle: handleSchema,
  name: z.string().min(1),
  /** Free text shown under the name: "Independent artist", "Student society"… */
  type: z.string().min(1),
  verified: z.boolean(),
  bio: z.string(),
  bannerTone: coverToneSchema,
  city: citySchema,
  category: categorySchema,
  agentId: idSchema.nullable(),
  rateBps: rateBpsSchema,
  status: organizerStatusSchema,
  payoutMethod: payoutMethodSchema,
});
export type Organizer = z.infer<typeof organizerSchema>;

/** What public pages get: no rate, agent or payout details. */
export const organizerSummarySchema = organizerSchema.pick({
  id: true,
  handle: true,
  name: true,
  type: true,
  verified: true,
});
export type OrganizerSummary = z.infer<typeof organizerSummarySchema>;

export const pastEventSchema = z.object({
  title: z.string(),
  /** Display month, e.g. "Aug 2026". */
  date: z.string(),
  tone: coverToneSchema,
});

export const organizerProfileSchema = organizerSummarySchema.extend({
  bio: z.string(),
  bannerTone: coverToneSchema,
  pastEvents: z.array(pastEventSchema),
});
export type OrganizerProfile = z.infer<typeof organizerProfileSchema>;
