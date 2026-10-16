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
  /** null for free tiers: nothing to pay. */
  paymentMethod: paymentMethodSchema.nullable(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/**
 * Why a payment failed, read from Paystack's gateway response (see apps/api/src/paystack.ts).
 * `declined` is a card the bank refused; the rest apply to M-Pesa, and insufficient_funds to cards too.
 */
export const paymentFailureSchema = z.enum([
  'insufficient_funds',
  'cancelled_by_user',
  'wrong_pin',
  'timeout',
  'declined',
  'unknown',
]);
export type PaymentFailure = z.infer<typeof paymentFailureSchema>;

export const orderSchema = z.object({
  id: idSchema,
  eventId: idSchema,
  tierId: idSchema,
  quantity: z.int().min(1).max(MAX_TICKETS_PER_ORDER),
  totalMinor: moneySchema,
  currency: currencySchema,
  buyer: buyerSchema,
  paymentMethod: paymentMethodSchema.nullable(),
  status: orderStatusSchema,
  failureReason: paymentFailureSchema.nullable(),
  /** When the latest payment prompt was sent; the waiting screen's timer counts from here. */
  paymentRequestedAt: dateTimeSchema.nullable(),
  /** Tickets are held for the buyer until this time, then released. */
  holdExpiresAt: dateTimeSchema,
  /** Card orders: Paystack's page where the buyer enters their card, while the payment is open. */
  paymentUrl: z.url().nullable(),
  /** The organizer's rate at the time of sale; later rate changes never touch it. */
  rateBps: rateBpsSchema,
  createdAt: dateTimeSchema,
});
export type Order = z.infer<typeof orderSchema>;

/** Issued tickets, present once the order is paid. */
export const orderTicketSchema = z.object({
  id: idSchema,
  code: z.string(),
  holderName: z.string(),
});

/** What GET /api/orders/:id returns. */
export const orderViewSchema = orderSchema.extend({ tickets: z.array(orderTicketSchema) });
export type OrderView = z.infer<typeof orderViewSchema>;

/** Error body for 4xx responses: a stable code for logic and a message fit to show the buyer. */
export const apiErrorBodySchema = z.object({ error: z.string(), message: z.string() });
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
