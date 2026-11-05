import { ENABLED_PAYMENT_METHODS, type Currency, type PaymentMethod } from './enums';
import { isKenyanMobile } from './phone';
import {
  MAX_TICKETS_ISSUED_PER_ORDER,
  tierRemaining,
  tierUnit,
  type CheckoutRequest,
  type PublicEvent,
  type TicketTier,
} from './schemas';
import { tierAvailability } from './tiers';

/** Which currencies each method can charge. M-Pesa is Kenyan shillings only; Paystack cards take KES and USD. */
export const METHOD_CURRENCIES: Record<PaymentMethod, readonly Currency[]> = {
  mpesa: ['KES'],
  momo: ['SSP'],
  card: ['KES', 'USD'],
};

/** Methods a buyer can actually use for this currency today. */
export const availablePaymentMethods = (currency: Currency): PaymentMethod[] =>
  ENABLED_PAYMENT_METHODS.filter((m) => METHOD_CURRENCIES[m].includes(currency));

/** Hold tickets this long while the buyer pays; after that they go back on sale. */
export const ORDER_HOLD_MINUTES = 10;

export type CheckoutError = { status: 404 | 409 | 422; error: string; message: string };

/** Most of this tier one order can take, up to `limit`, without going over the ticket cap. */
export const maxPerOrder = (tier: Pick<TicketTier, 'admits'>, limit: number) =>
  Math.max(1, Math.min(limit, Math.floor(MAX_TICKETS_ISSUED_PER_ORDER / tier.admits)));

/** An order of this many would issue more tickets than the cap allows. */
function tooManyTickets(tier: TicketTier, quantity: number): CheckoutError | undefined {
  if (quantity * tier.admits <= MAX_TICKETS_ISSUED_PER_ORDER) return undefined;
  const most = maxPerOrder(tier, Infinity);
  return {
    status: 422,
    error: 'too_many_tickets',
    message: `An order can have up to ${MAX_TICKETS_ISSUED_PER_ORDER} tickets: that's ${most} ${tier.name} ${tierUnit(tier, most)}.`,
  };
}
export type CheckoutOk = { tier: TicketTier; totalMinor: number };

/**
 * Every rule a checkout must pass, shared by the mock API and the real backend
 * so the buyer sees the same messages from both.
 */
export function validateCheckout(
  event: PublicEvent,
  req: CheckoutRequest,
  now: Date = new Date(),
): CheckoutOk | CheckoutError {
  const tier = event.tiers.find((t) => t.id === req.tierId);
  if (!tier)
    return { status: 404, error: 'tier_not_found', message: 'That ticket type no longer exists.' };

  const tooMany = tooManyTickets(tier, req.quantity);
  if (tooMany) return tooMany;

  const availability = tierAvailability(tier, now);
  if (availability.status === 'sold_out') {
    return { status: 409, error: 'sold_out', message: `${tier.name} tickets just sold out.` };
  }
  if (availability.status !== 'on_sale') {
    return {
      status: 409,
      error: 'not_on_sale',
      message: `${tier.name} tickets aren't on sale right now.`,
    };
  }
  if (availability.remaining !== null && req.quantity > availability.remaining) {
    return {
      status: 409,
      error: 'not_enough_tickets',
      message: `Only ${availability.remaining} ${tier.name} ${tierUnit(tier, availability.remaining)} ${availability.remaining === 1 ? 'is' : 'are'} left.`,
    };
  }

  const totalMinor = tier.priceMinor * req.quantity;
  if (totalMinor === 0) return { tier, totalMinor };

  if (!req.paymentMethod || !availablePaymentMethods(event.currency).includes(req.paymentMethod)) {
    return {
      status: 422,
      error: 'payment_method_unavailable',
      message: 'That payment method isn’t available for this event.',
    };
  }
  if (req.paymentMethod === 'mpesa' && !isKenyanMobile(req.buyer.phone)) {
    return {
      status: 422,
      error: 'invalid_phone',
      message: 'M-Pesa needs a Kenyan M-Pesa number, like 0712 345 678.',
    };
  }
  return { tier, totalMinor };
}

export const isCheckoutError = (r: object): r is CheckoutError => 'error' in r;

/**
 * Rules for an organizer giving tickets away. Sale dates don't apply (guests can be added before
 * sales open or after they close), but capacity does, and nobody is let in after the event.
 */
export function validateComp(
  event: PublicEvent,
  req: Pick<CheckoutRequest, 'tierId' | 'quantity'>,
  now: Date = new Date(),
): { tier: TicketTier } | CheckoutError {
  const tier = event.tiers.find((t) => t.id === req.tierId);
  if (!tier)
    return { status: 404, error: 'tier_not_found', message: 'That ticket type no longer exists.' };
  if (Date.parse(event.endsAt) <= now.getTime()) {
    return { status: 409, error: 'event_ended', message: 'This event has ended.' };
  }
  const tooMany = tooManyTickets(tier, req.quantity);
  if (tooMany) return tooMany;
  const remaining = tierRemaining(tier);
  if (remaining !== null && req.quantity > remaining) {
    return {
      status: 409,
      error: 'not_enough_tickets',
      message:
        remaining === 0
          ? `${tier.name} is sold out. Pick another tier or raise its quantity.`
          : `Only ${remaining} ${tier.name} ${tierUnit(tier, remaining)} ${remaining === 1 ? 'is' : 'are'} left.`,
    };
  }
  return { tier };
}
