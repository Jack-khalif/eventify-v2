import { describe, expect, it } from 'vitest';
import { publicEvents } from './fixtures';
import { eventDescription, initials } from './text';

describe('initials', () => {
  it.each([
    ['Amani Wanjiru', 'AW'],
    ['IEEE Strathmore Student Branch', 'IS'],
    ['Deng Training Co.', 'DT'],
    ['lens kenya', 'LK'],
  ])('%s → %s', (name, expected) => expect(initials(name)).toBe(expected));
});

describe('eventDescription', () => {
  const all = publicEvents();

  it('uses the organizer’s own description when there is one', () => {
    const sauti = all.find((e) => e.slug === 'sauti-sessions')!;
    expect(eventDescription(sauti)).toBe(sauti.description);
  });

  it('falls back to the design’s generated text', () => {
    const pwani = all.find((e) => e.slug === 'pwani-taarab')!;
    expect(eventDescription(pwani)[0]).toBe(
      'Pwani Food & Taarab Evening by Pwani Culture Trust. 6:00 PM – 11:00 PM at Fort Jesus Grounds.',
    );
  });
});
