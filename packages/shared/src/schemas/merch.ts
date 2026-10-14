import { z } from 'zod';
import { dateTimeSchema, handleSchema, idSchema } from './common';

/** Branded items Eventify's print partners make for an event. */
export const MERCH_ITEMS = ['banner', 'wristband', 'lanyard', 'poster', 'table_bunting'] as const;
export const merchItemSchema = z.enum(MERCH_ITEMS);
export type MerchItem = z.infer<typeof merchItemSchema>;

export const MERCH_ITEM_LABEL: Record<MerchItem, string> = {
  banner: 'Banners',
  wristband: 'Wristbands',
  lanyard: 'Lanyards',
  poster: 'Posters',
  table_bunting: 'Table buntings',
};

/**
 * Where a request is in the print queue. Ops move it along; the organizer sees each step on their
 * dashboard. "cancelled" covers both "you asked us to stop" and "we can't do this one".
 */
export const MERCH_STATUSES = [
  'received',
  'in_production',
  'ready',
  'delivered',
  'cancelled',
] as const;
export const merchStatusSchema = z.enum(MERCH_STATUSES);
export type MerchStatus = z.infer<typeof merchStatusSchema>;

export const MERCH_STATUS_LABEL: Record<MerchStatus, string> = {
  received: 'Received',
  in_production: 'In production',
  ready: 'Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Largest run of one item in a single request; bigger jobs go through the team directly. */
export const MAX_MERCH_QUANTITY = 10_000;

export const merchLineSchema = z.object({
  item: merchItemSchema,
  quantity: z.int().min(1).max(MAX_MERCH_QUANTITY),
});
export type MerchLine = z.infer<typeof merchLineSchema>;

/** POST /api/organizer/events/:id/merch */
export const merchRequestSchema = z.object({
  items: z
    .array(merchLineSchema)
    .min(1, 'Pick at least one item')
    .max(MERCH_ITEMS.length)
    .refine((lines) => new Set(lines.map((l) => l.item)).size === lines.length, {
      message: 'Each item once, please',
    }),
  brandingNotes: z
    .string()
    .trim()
    .min(10, 'Tell us what to print: logo, colours, wording, sizes')
    .max(2000),
});
export type MerchRequest = z.infer<typeof merchRequestSchema>;

/** One request as its organizer sees it. */
export const merchRequestRowSchema = z.object({
  id: idSchema,
  items: z.array(merchLineSchema),
  brandingNotes: z.string(),
  status: merchStatusSchema,
  /** What ops last told the organizer: a quote, a pickup point, why it was cancelled. */
  opsNote: z.string(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type MerchRequestRow = z.infer<typeof merchRequestRowSchema>;

/** GET /api/organizer/events/:id/merch (and the reply to a new request), newest first. */
export const merchListSchema = z.object({ requests: z.array(merchRequestRowSchema) });

/** A request in the admin portal's print queue, with who to contact and when it's needed by. */
export const adminMerchRowSchema = merchRequestRowSchema.extend({
  organizer: z.object({ name: z.string(), handle: handleSchema, email: z.string() }),
  event: z.object({ id: idSchema, title: z.string(), startsAt: dateTimeSchema }),
});
export type AdminMerchRow = z.infer<typeof adminMerchRowSchema>;

/** POST /api/admin/merch/:id/status */
export const merchStatusChangeSchema = z.object({
  status: merchStatusSchema,
  note: z.string().trim().max(500),
});
export type MerchStatusChange = z.infer<typeof merchStatusChangeSchema>;
