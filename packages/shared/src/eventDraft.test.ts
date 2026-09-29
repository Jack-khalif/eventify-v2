import { describe, expect, it } from 'vitest';
import {
  detailsErrors,
  draftPriceLabel,
  draftToRequest,
  emptyEventDraft,
  eventTimes,
  newTierDraft,
  tierPayout,
  tiersErrors,
  type EventDraft,
} from './eventDraft';
import { createEventRequestSchema } from './schemas';

const NOW = new Date('2026-09-29T10:00:00+03:00');

const draft = (patch: Partial<EventDraft> = {}): EventDraft => ({
  ...emptyEventDraft(),
  title: 'Sunset Rooftop Sessions',
  venue: 'Sankara Rooftop, Westlands',
  date: '2026-10-24',
  startTime: '18:00',
  endTime: '23:00',
  ...patch,
});

describe('eventTimes', () => {
  it('reads the date and times as EAT', () => {
    expect(eventTimes(draft())).toEqual({
      startsAt: '2026-10-24T18:00:00+03:00',
      endsAt: '2026-10-24T23:00:00+03:00',
    });
  });

  it('rolls an end time before the start over to the next day', () => {
    expect(eventTimes(draft({ endTime: '02:00' }))?.endsAt).toBe('2026-10-25T02:00:00+03:00');
  });

  it('is null until date and both times are set', () => {
    expect(eventTimes(draft({ endTime: '' }))).toBeNull();
  });
});

describe('detailsErrors', () => {
  it('passes a complete draft', () => {
    expect(detailsErrors(draft(), NOW)).toEqual({});
  });

  it('names every missing field', () => {
    expect(Object.keys(detailsErrors(emptyEventDraft(), NOW)).sort()).toEqual([
      'date',
      'endTime',
      'startTime',
      'title',
      'venue',
    ]);
  });

  it('rejects a start in the past', () => {
    expect(detailsErrors(draft({ date: '2026-09-28' }), NOW).date).toBe(
      'Pick a date and time in the future.',
    );
  });
});

describe('tiersErrors', () => {
  it('flags blank, duplicate and malformed tiers', () => {
    const a = { ...newTierDraft('Regular', '1200'), quantity: '0' };
    const b = newTierDraft('regular ', '12.5');
    const c = newTierDraft('', '');
    const errors = tiersErrors(draft({ tiers: [a, b, c] }));
    expect(errors[a.key]).toEqual({ quantity: 'Enter how many, or leave it blank for no limit.' });
    expect(errors[b.key]).toEqual({
      name: 'Each tier needs a different name.',
      price: 'Whole numbers only.',
    });
    expect(errors[c.key]).toEqual({
      name: 'Name this tier.',
      price: 'Enter a price, or 0 for free.',
    });
  });

  it('checks the sale window against itself and the event end', () => {
    const backwards = {
      ...newTierDraft('Early Bird', '800'),
      saleStartsAt: '2026-10-10T12:00',
      saleEndsAt: '2026-10-01T12:00',
    };
    const late = { ...newTierDraft('Regular', '1200'), saleEndsAt: '2026-10-25T09:00' };
    const errors = tiersErrors(draft({ tiers: [backwards, late] }));
    expect(errors[backwards.key]?.saleEndsAt).toBe('Sales must end after they start.');
    expect(errors[late.key]?.saleEndsAt).toBe('Sales must end before the event does.');
  });
});

describe('payout and price label', () => {
  it('takes the organizer rate out of each ticket', () => {
    const t = newTierDraft('Regular', '1200');
    expect(tierPayout(draft(), t, 450)).toEqual({ payout: 'KSh 1,146', fee: 'KSh 54' });
    expect(tierPayout(draft(), newTierDraft('Free', '0'), 450)).toBeNull();
  });

  it('prices in the city currency', () => {
    const tiers = [newTierDraft('Regular', '20000'), newTierDraft('Student', '8000')];
    expect(draftPriceLabel(draft({ city: 'Juba', tiers }))).toBe('From SSP 8,000');
    expect(draftPriceLabel(draft({ tiers: [newTierDraft('RSVP', '0')] }))).toBe('Free');
  });
});

describe('draftToRequest', () => {
  it('builds a request the API accepts', () => {
    const request = draftToRequest(
      draft({
        description: 'Golden hour on the roof.\n\n  Doors at 6.  \n\n',
        tiers: [{ ...newTierDraft('Regular', '1200'), quantity: '150' }],
      }),
    );
    expect(createEventRequestSchema.parse(request)).toEqual(request);
    expect(request.description).toEqual(['Golden hour on the roof.', 'Doors at 6.']);
    expect(request.tiers[0]).toMatchObject({ priceMinor: 120_000, quantity: 150 });
  });
});
