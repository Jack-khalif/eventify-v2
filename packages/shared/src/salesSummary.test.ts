import { describe, expect, it } from 'vitest';
import { events } from './fixtures';
import { toMinor } from './money';
import { displayStatus, lastDays, salesSummary } from './salesSummary';

describe('salesSummary', () => {
  it('adds up the tiers', () => {
    const sauti = events.find((e) => e.id === 'evt_sauti')!;
    const summary = salesSummary(sauti);
    expect(summary.ticketsSold).toBe(100 + 210 + 84 + 18);
    expect(summary.grossMinor).toBe(toMinor(80_000 + 252_000 + 50_400 + 54_000));
    expect(summary.capacity).toBe(600);
    expect(summary.tierSales[3]).toEqual({ name: 'VIP', sold: 18, revenueMinor: toMinor(54_000) });
  });
});

describe('lastDays', () => {
  it('sums the newest entries', () => {
    expect(lastDays([1, 2, 3, 4], 2)).toBe(7);
  });
});

describe('displayStatus', () => {
  const e = { status: 'live' as const, endsAt: '2026-10-03T01:00:00+03:00' };
  it('turns a finished live event into ended', () => {
    expect(displayStatus(e, new Date('2026-10-01T00:00:00+03:00'))).toBe('live');
    expect(displayStatus(e, new Date('2026-10-03T01:00:00+03:00'))).toBe('ended');
    expect(displayStatus({ ...e, status: 'draft' }, new Date('2027-01-01'))).toBe('draft');
  });
});
