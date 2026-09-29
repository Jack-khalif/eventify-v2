import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDayNumber,
  formatMonth,
  formatTimeRange,
  formatWeekday,
  upcomingWeekend,
} from './dates';

describe('EAT formatting', () => {
  const start = '2026-10-02T19:00:00+03:00';
  const end = '2026-10-03T01:00:00+03:00';

  it('formats the pieces the design uses', () => {
    expect(formatWeekday(start)).toBe('Fri');
    expect(formatDayNumber(start)).toBe('02');
    expect(formatMonth(start)).toBe('Oct');
    expect(formatDate(start)).toBe('Fri 2 Oct');
    expect(formatTimeRange(start, end)).toBe('7:00 PM – 1:00 AM');
  });

  it('uses EAT regardless of the input offset', () => {
    // 22:30 UTC on Thursday is 01:30 Friday in Nairobi.
    expect(formatDate('2026-10-01T22:30:00Z')).toBe('Fri 2 Oct');
  });
});

describe('upcomingWeekend', () => {
  it('looks ahead to Friday from a weekday', () => {
    // Tuesday 29 Sep 2026, 10:00 EAT
    const w = upcomingWeekend(new Date('2026-09-29T10:00:00+03:00'));
    expect(w.from).toBe('2026-10-01T21:00:00.000Z'); // Fri 2 Oct 00:00 EAT
    expect(w.to).toBe('2026-10-04T21:00:00.000Z'); // Mon 5 Oct 00:00 EAT
    expect(w.label).toBe('Fri 2 – Sun 4 Oct');
  });

  it('keeps the current weekend on Saturday and Sunday', () => {
    const sat = upcomingWeekend(new Date('2026-10-03T12:00:00+03:00'));
    const sun = upcomingWeekend(new Date('2026-10-04T23:30:00+03:00'));
    expect(sat.label).toBe('Fri 2 – Sun 4 Oct');
    expect(sun.label).toBe('Fri 2 – Sun 4 Oct');
  });

  it('moves on at Monday 00:00 EAT, even though it is still Sunday in UTC', () => {
    expect(upcomingWeekend(new Date('2026-10-04T21:30:00Z')).label).toBe('Fri 9 – Sun 11 Oct');
  });

  it('names both months when the weekend spans two', () => {
    expect(upcomingWeekend(new Date('2026-10-27T10:00:00+03:00')).label).toBe(
      'Fri 30 Oct – Sun 1 Nov',
    );
  });
});
