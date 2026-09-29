import { z } from 'zod';
import {
  categorySchema,
  citySchema,
  coverToneSchema,
  currencySchema,
  eventStatusSchema,
} from '../enums';
import { dateTimeSchema, idSchema, imageUrlSchema, moneySchema, slugSchema } from './common';
import { formatMoney } from '../money';
import { organizerSummarySchema } from './organizer';

export const ticketTierSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  note: z.string(),
  priceMinor: moneySchema,
  /** null = no cap. */
  quantity: z.int().positive().nullable(),
  sold: z.int().nonnegative(),
  saleStartsAt: dateTimeSchema.nullable(),
  saleEndsAt: dateTimeSchema.nullable(),
});
export type TicketTier = z.infer<typeof ticketTierSchema>;

export const eventSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  category: categorySchema,
  city: citySchema,
  currency: currencySchema,
  venue: z.string().min(1),
  address: z.string(),
  /**
   * Exact location picked by the organizer (a Google Maps link). The venue name above is still what
   * people see; this only makes "Get directions" land on the right pin.
   */
  mapUrl: z.url().nullable(),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  /** Paragraphs. */
  description: z.array(z.string()),
  coverTone: coverToneSchema,
  /** The organizer's poster. Cards and link previews show it; the striped tone is only a fallback. */
  coverImageUrl: imageUrlSchema.nullable(),
  organizerId: idSchema,
  status: eventStatusSchema,
  tiers: z.array(ticketTierSchema).min(1),
});
export type Event = z.infer<typeof eventSchema>;

/** Shape returned by public event endpoints. */
export const publicEventSchema = eventSchema.extend({ organizer: organizerSummarySchema });
export type PublicEvent = z.infer<typeof publicEventSchema>;

export const LOW_STOCK_THRESHOLD = 15;

export const tierRemaining = (t: TicketTier) =>
  t.quantity === null ? null : Math.max(t.quantity - t.sold, 0);

export const tierSoldOut = (t: TicketTier) => tierRemaining(t) === 0;

export const isFreeEvent = (e: Pick<Event, 'tiers'>) => e.tiers.every((t) => t.priceMinor === 0);

/** "Free", "KSh 1,500", or "From KSh 600" (cheapest paid tier still on sale). */
export function priceLabel(e: Pick<Event, 'tiers' | 'currency'>): string {
  if (isFreeEvent(e)) return 'Free';
  const onSale = e.tiers
    .filter((t) => !tierSoldOut(t) && t.priceMinor > 0)
    .map((t) => t.priceMinor);
  if (onSale.length === 0) return 'Sold out';
  return (e.tiers.length > 1 ? 'From ' : '') + formatMoney(e.currency, Math.min(...onSale));
}

/** POST /api/organizer/events: what the Create event wizard sends. The server fills in the rest. */
export const createEventRequestSchema = eventSchema
  .pick({
    title: true,
    category: true,
    city: true,
    venue: true,
    startsAt: true,
    endsAt: true,
    description: true,
    coverImageUrl: true,
  })
  .extend({
    tiers: z
      .array(
        ticketTierSchema.pick({
          name: true,
          note: true,
          priceMinor: true,
          quantity: true,
          saleStartsAt: true,
          saleEndsAt: true,
        }),
      )
      .min(1)
      .max(10),
  });
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
