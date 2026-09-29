import { describe, expect, it } from 'vitest';
import { feeFor, formatMoney, organizerNetFor, rateNeedsApproval, toMinor } from './money';

describe('money', () => {
  it('formats whole units with the design’s labels', () => {
    expect(formatMoney('KES', toMinor(1200))).toBe('KSh 1,200');
    expect(formatMoney('SSP', toMinor(120000))).toBe('SSP 120,000');
  });

  it('splits a sale into fee and organizer net that add back up', () => {
    const gross = toMinor(452_600);
    expect(feeFor(gross, 450)).toBe(toMinor(20_367));
    expect(feeFor(gross, 450) + organizerNetFor(gross, 450)).toBe(gross);
  });

  it('routes rates under 3% to approval', () => {
    expect(rateNeedsApproval(240)).toBe(true);
    expect(rateNeedsApproval(300)).toBe(false);
  });
});
