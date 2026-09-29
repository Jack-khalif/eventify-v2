import { describe, expect, it } from 'vitest';
import { events } from './fixtures';
import type { TicketTier } from './schemas';
import { defaultTier, tierAvailability } from './tiers';

const now = new Date('2026-09-29T10:00:00+03:00');
const tier = (patch: Partial<TicketTier>): TicketTier => ({
  id: 't',
  name: 'Regular',
  note: '',
  priceMinor: 100_000,
  quantity: null,
  sold: 0,
  saleStartsAt: null,
  saleEndsAt: null,
  ...patch,
});

describe('tierAvailability', () => {
  it('is on sale with no cap and no window', () => {
    expect(tierAvailability(tier({}), now)).toEqual({
      status: 'on_sale',
      remaining: null,
      lowStock: false,
    });
  });

  it('flags low stock at 15 or fewer left', () => {
    expect(tierAvailability(tier({ quantity: 50, sold: 35 }), now)).toMatchObject({
      remaining: 15,
      lowStock: true,
    });
    expect(tierAvailability(tier({ quantity: 50, sold: 34 }), now)).toMatchObject({
      remaining: 16,
      lowStock: false,
    });
  });

  it('is sold out when nothing remains', () => {
    expect(tierAvailability(tier({ quantity: 100, sold: 100 }), now)).toEqual({
      status: 'sold_out',
    });
  });

  it('respects the sale window', () => {
    expect(tierAvailability(tier({ saleStartsAt: '2026-10-01T09:00:00+03:00' }), now)).toEqual({
      status: 'not_started',
      opensAt: '2026-10-01T09:00:00+03:00',
    });
    expect(tierAvailability(tier({ saleEndsAt: '2026-09-29T10:00:00+03:00' }), now)).toEqual({
      status: 'ended',
    });
  });
});

describe('defaultTier', () => {
  it('skips sold-out tiers, as in the design (Sauti opens on Regular)', () => {
    const sauti = events.find((e) => e.slug === 'sauti-sessions')!;
    expect(defaultTier(sauti.tiers, now)?.name).toBe('Regular');
  });

  it('returns nothing when every tier is unavailable', () => {
    expect(defaultTier([tier({ quantity: 1, sold: 1 })], now)).toBeUndefined();
  });
});
