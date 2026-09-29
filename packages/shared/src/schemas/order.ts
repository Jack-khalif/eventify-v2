import { z } from 'zod';
import { currencySchema, orderStatusSchema, paymentMethodSchema } from '../enums';
import { dateTimeSchema, idSchema, moneySchema, rateBpsSchema } from './common';

export const MAX_TICKETS_PER_ORDER = 10;

export const buyerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  /** E.164. Normalise with normalizePhone() before validating. */
  phone: z.string().regex(/^\+\d{9,15}$/, 'Enter a valid phone number'),
  email: z.email('Enter a valid email'),
});
export type Buyer = z.infer<typeof buyerSchema>;

export const checkoutRequestSchema = z.object({
  eventId: idSchema,
  tierId: idSchema,
  quantity: z.int().min(1).max(MAX_TICKETS_PER_ORDER),
  buyer: buyerSchema,
  paymentMethod: paymentMethodSchema,
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const orderSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  tierId: idSchema,
  quantity: z.int().min(1).max(MAX_TICKETS_PER_ORDER),
  totalMinor: moneySchema,
  currency: currencySchema,
  buyer: buyerSchema,
  paymentMethod: paymentMethodSchema,
  status: orderStatusSchema,
  /** The organizer's rate at the time of sale; later rate changes never touch it. */
  rateBps: rateBpsSchema,
  createdAt: dateTimeSchema,
});
export type Order = z.infer<typeof orderSchema>;
