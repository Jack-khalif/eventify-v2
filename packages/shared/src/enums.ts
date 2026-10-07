import { z } from 'zod';

export const CITIES = ['Nairobi', 'Juba', 'Mombasa', 'Kisumu'] as const;
export const citySchema = z.enum(CITIES);
export type City = z.infer<typeof citySchema>;

export const CATEGORIES = ['Corporate', 'Campus', 'Music & Arts', 'Workshops'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

/** ISO 4217 codes. Display labels ("KSh") live in money.ts. */
export const currencySchema = z.enum(['KES', 'SSP']);
export type Currency = z.infer<typeof currencySchema>;

export const CITY_CURRENCY: Record<City, Currency> = {
  Nairobi: 'KES',
  Mombasa: 'KES',
  Kisumu: 'KES',
  Juba: 'SSP',
};

/** Placeholder cover styles from the design, used until an organizer uploads a poster. */
export const coverToneSchema = z.enum(['music', 'campus', 'corporate', 'workshop']);
export type CoverTone = z.infer<typeof coverToneSchema>;

export const eventStatusSchema = z.enum(['draft', 'live', 'ended']);
export type EventStatus = z.infer<typeof eventStatusSchema>;

/** pending = applied, waiting for a Super Admin; rejected = application declined. Only active organizers can publish. */
export const organizerStatusSchema = z.enum(['active', 'pending', 'suspended', 'rejected']);
export type OrganizerStatus = z.infer<typeof organizerStatusSchema>;

export const paymentMethodSchema = z.enum(['mpesa', 'momo', 'card']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Only M-Pesa is live at launch; the others render as "coming soon". */
export const ENABLED_PAYMENT_METHODS: readonly PaymentMethod[] = ['mpesa'];

export const orderStatusSchema = z.enum([
  'pending',
  'awaiting_payment',
  'paid',
  'failed',
  'expired',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const payoutMethodSchema = z.enum(['mpesa', 'bank']);
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const payoutStatusSchema = z.enum(['pending', 'processing', 'paid']);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

/** attendee = a verified phone with no organizer or staff rights (what every new sign-in starts as). */
export const roleSchema = z.enum(['attendee', 'organizer', 'agent', 'super_admin']);
export type Role = z.infer<typeof roleSchema>;
