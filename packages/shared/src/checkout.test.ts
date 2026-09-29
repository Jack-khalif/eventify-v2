import { describe, expect, it } from 'vitest';
import { availablePaymentMethods, isCheckoutError, validateCheckout } from './checkout';
import { publicEvents } from './fixtures';
import type { CheckoutRequest } from './schemas';

const now = new Date('2026-09-29T10:00:00+03:00');
const all = publicEvents();
const bySlug = (slug: string) => all.find((e) => e.slug === slug)!;
const buyer = { name: 'Amina Otieno', phone: '+254712345678', email: 'amina@example.com' };
const req = (patch: Partial<CheckoutRequest>): CheckoutRequest => ({
  eventId: 'evt_sauti',
  tierId: 'tier_sauti_regular',
  quantity: 2,
  buyer,
  paymentMethod: 'mpesa',
  ...patch,
});

describe('availablePaymentMethods', () => {
  it('offers M-Pesa for Kenyan shillings only (MoMo and card are not live yet)', () => {
    expect(availablePaymentMethods('KES')).toEqual(['mpesa']);
    expect(availablePaymentMethods('SSP')).toEqual([]);
  });
});

describe('validateCheckout', () => {
  it('accepts a normal M-Pesa order and prices it', () => {
    const r = validateCheckout(bySlug('sauti-sessions'), req({}), now);
    expect(isCheckoutError(r)).toBe(false);
    expect(r).toMatchObject({ totalMinor: 240_000 });
  });

  it('rejects sold-out tiers and orders bigger than what is left', () => {
    expect(
      validateCheckout(bySlug('sauti-sessions'), req({ tierId: 'tier_sauti_early_bird' }), now),
    ).toMatchObject({
      status: 409,
      error: 'sold_out',
    });
    expect(
      validateCheckout(
        bySlug('paylink-launch'),
        req({ eventId: 'evt_launch', tierId: 'tier_launch_early_bird', quantity: 9 }),
        now,
      ),
    ).toMatchObject({
      error: 'not_enough_tickets',
      message: 'Only 8 Early Bird tickets are left.',
    });
  });

  it('needs no payment method for free tickets', () => {
    const r = validateCheckout(
      bySlug('ieee-hackathon'),
      req({ eventId: 'evt_hack', tierId: 'tier_hack_free_rsvp', paymentMethod: null }),
      now,
    );
    expect(r).toMatchObject({ totalMinor: 0 });
  });

  it('refuses methods that are not live or do not match the currency', () => {
    expect(
      validateCheckout(bySlug('sauti-sessions'), req({ paymentMethod: 'card' }), now),
    ).toMatchObject({
      error: 'payment_method_unavailable',
    });
    expect(
      validateCheckout(
        bySlug('juba-tech-summit'),
        req({ eventId: 'evt_summit', tierId: 'tier_summit_regular' }),
        now,
      ),
    ).toMatchObject({ error: 'payment_method_unavailable' });
    expect(
      validateCheckout(bySlug('sauti-sessions'), req({ paymentMethod: null }), now),
    ).toMatchObject({
      error: 'payment_method_unavailable',
    });
  });

  it('requires a Kenyan number for M-Pesa', () => {
    const r = validateCheckout(
      bySlug('sauti-sessions'),
      req({ buyer: { ...buyer, phone: '+211922456781' } }),
      now,
    );
    expect(r).toMatchObject({ status: 422, error: 'invalid_phone' });
  });

  it('reports a tier that does not exist', () => {
    expect(validateCheckout(bySlug('sauti-sessions'), req({ tierId: 'nope' }), now)).toMatchObject({
      status: 404,
    });
  });
});
