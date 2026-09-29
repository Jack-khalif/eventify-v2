import { describe, expect, it } from 'vitest';
import { buildCalendarFile } from './calendar';
import { publicEvents } from './fixtures';

describe('buildCalendarFile', () => {
  const sauti = publicEvents().find((e) => e.slug === 'sauti-sessions')!;
  const ics = buildCalendarFile(
    sauti,
    'https://eventify.co/e/sauti-sessions',
    new Date('2026-09-29T07:00:00Z'),
  );

  it('uses UTC times and CRLF line endings', () => {
    expect(ics).toContain('DTSTART:20261002T160000Z\r\n');
    expect(ics).toContain('DTEND:20261002T220000Z\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('escapes commas in text fields', () => {
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(
      'LOCATION:The Alchemist\\, Westlands\\, Parklands Rd\\, Westlands\\, Nairobi\r\n',
    );
  });

  it('escapes semicolons, backslashes and newlines', () => {
    const tricky = { ...sauti, title: 'Talks; Q&A \\ Demos\nAfter-party' };
    expect(buildCalendarFile(tricky, 'https://eventify.co/e/x')).toContain(
      'SUMMARY:Talks\\; Q&A \\\\ Demos\\nAfter-party\r\n',
    );
  });

  it('folds long lines at 75 characters without losing text', () => {
    const long = { ...sauti, title: 'A'.repeat(200) };
    const out = buildCalendarFile(long, 'https://eventify.co/e/x');
    for (const line of out.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
    expect(out.replace(/\r\n /g, '')).toContain(`SUMMARY:${'A'.repeat(200)}\r\n`);
  });
});
