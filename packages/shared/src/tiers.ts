import { LOW_STOCK_THRESHOLD, tierRemaining, type TicketTier } from './schemas';

export type TierAvailability =
  | { status: 'on_sale'; remaining: number | null; lowStock: boolean }
  | { status: 'sold_out' }
  | { status: 'not_started'; opensAt: string }
  | { status: 'ended' };

/** Whether a tier can be bought right now, and why not if it can't. */
export function tierAvailability(tier: TicketTier, now: Date = new Date()): TierAvailability {
  const remaining = tierRemaining(tier);
  if (remaining === 0) return { status: 'sold_out' };
  if (tier.saleStartsAt && Date.parse(tier.saleStartsAt) > now.getTime()) {
    return { status: 'not_started', opensAt: tier.saleStartsAt };
  }
  if (tier.saleEndsAt && Date.parse(tier.saleEndsAt) <= now.getTime()) return { status: 'ended' };
  return {
    status: 'on_sale',
    remaining,
    lowStock: remaining !== null && remaining <= LOW_STOCK_THRESHOLD,
  };
}

/** The tier selected when the page opens: the first one on sale, as in the design. */
export function defaultTier(tiers: TicketTier[], now: Date = new Date()): TicketTier | undefined {
  return tiers.find((t) => tierAvailability(t, now).status === 'on_sale');
}
