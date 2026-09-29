import { describe, expect, it } from 'vitest';
import { decideRateChange, isRateError } from './adminRules';
import { HISTORY_DAYS, organizerDailySalesMinor, organizerSalesMinor } from './fixtures';

const req = (rateBps: number, reason = 'Volume discount for repeat events') => ({
  rateBps,
  reason,
  eventId: null,
});

describe('decideRateChange', () => {
  it('lets agents apply rates from the 3% floor up', () => {
    expect(decideRateChange('agent', req(300), 500)).toEqual({ outcome: 'applied' });
  });

  it('sends agent requests below 3% for approval, but not Super Admin changes', () => {
    expect(decideRateChange('agent', req(240), 500)).toEqual({ outcome: 'sent_for_approval' });
    expect(decideRateChange('super_admin', req(240), 500)).toEqual({ outcome: 'applied' });
  });

  it('rejects out-of-range rates, missing reasons and no-op changes', () => {
    const outOfRange = decideRateChange('super_admin', req(750), 500);
    expect(isRateError(outOfRange) && outOfRange.message).toBe('Rates must be between 1% and 7%.');
    expect(decideRateChange('agent', req(450, ' ok '), 500)).toMatchObject({
      error: 'reason_required',
    });
    expect(decideRateChange('agent', req(500), 500)).toMatchObject({ error: 'unchanged' });
  });
});

describe('organizerDailySalesMinor', () => {
  it('covers 90 days and adds up to 60% of lifetime sales', () => {
    const days = organizerDailySalesMinor('org_amani');
    expect(days).toHaveLength(HISTORY_DAYS);
    expect(days.every((d) => d >= 0)).toBe(true);
    expect(days.reduce((a, d) => a + d, 0)).toBe(Math.round(organizerSalesMinor.org_amani! * 0.6));
    expect(organizerDailySalesMinor('org_amani')).toEqual(days);
  });
});
