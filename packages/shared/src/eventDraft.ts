import { toEatIso } from './dates';
import { CITY_CURRENCY, type Category, type City, type CoverTone } from './enums';
import { feeFor, formatMoney, toMinor } from './money';
import type { CreateEventRequest } from './schemas';

/**
 * The Create event wizard edits a draft of plain strings (what the inputs hold). These rules turn
 * it into a CreateEventRequest, and give the organizer field-level messages on the way.
 * The mock API and the backend re-check the request with createEventRequestSchema.
 */

export const TIER_PRESETS = ['Early Bird', 'Regular', 'VIP', 'Student', 'Free / RSVP'] as const;
export const MAX_TIERS = 10;
/** Highest ticket price in whole units, to catch an extra zero typed by accident. */
export const MAX_TIER_PRICE = 1_000_000;

export const CATEGORY_TONE: Record<Category, CoverTone> = {
  Corporate: 'corporate',
  Campus: 'campus',
  'Music & Arts': 'music',
  Workshops: 'workshop',
};

export type TierDraft = {
  /** Stable key for React lists and error lookup; not sent. */
  key: string;
  name: string;
  /** Whole units, digits only ("1200"). */
  price: string;
  /** Digits, or "" for no limit. */
  quantity: string;
  /** datetime-local values in EAT ("2026-10-02T18:00"), or "" for now / until the event. */
  saleStartsAt: string;
  saleEndsAt: string;
};

export type EventDraft = {
  title: string;
  category: Category;
  city: City;
  venue: string;
  /** "2026-10-24" */
  date: string;
  /** "18:00" */
  startTime: string;
  /** "23:00". Earlier than the start means it ends the next day. */
  endTime: string;
  /** Paragraphs separated by blank lines. */
  description: string;
  coverImageUrl: string | null;
  tiers: TierDraft[];
};

let tierKey = 0;
export function newTierDraft(name = '', price = ''): TierDraft {
  tierKey += 1;
  return { key: `tier-${tierKey}`, name, price, quantity: '', saleStartsAt: '', saleEndsAt: '' };
}

export const presetTier = (name: (typeof TIER_PRESETS)[number]) =>
  newTierDraft(name, name === 'Free / RSVP' ? '0' : '');

export function emptyEventDraft(): EventDraft {
  return {
    title: '',
    category: 'Music & Arts',
    city: 'Nairobi',
    venue: '',
    date: '',
    startTime: '',
    endTime: '',
    description: '',
    coverImageUrl: null,
    tiers: [newTierDraft('Regular')],
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DIGITS = /^\d+$/;
const localToEat = (value: string) => (value ? `${value}:00+03:00` : null);

/** Start and end as EAT ISO strings, or null while the date or times are missing. */
export function eventTimes(d: EventDraft): { startsAt: string; endsAt: string } | null {
  if (!d.date || !d.startTime || !d.endTime) return null;
  const start = Date.parse(`${d.date}T${d.startTime}:00+03:00`);
  let end = Date.parse(`${d.date}T${d.endTime}:00+03:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end <= start) end += 24 * HOUR_MS;
  return { startsAt: toEatIso(start), endsAt: toEatIso(end) };
}

export type DetailsField = 'title' | 'venue' | 'date' | 'startTime' | 'endTime';
export type DetailsErrors = Partial<Record<DetailsField, string>>;

export function detailsErrors(d: EventDraft, now: Date = new Date()): DetailsErrors {
  const errors: DetailsErrors = {};
  const title = d.title.trim();
  if (!title) errors.title = 'Give your event a title.';
  else if (title.length < 3) errors.title = 'Use at least 3 characters.';
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.';
  if (!d.venue.trim()) errors.venue = 'Add a venue, or an online link.';
  if (!d.date) errors.date = 'Pick a date.';
  if (!d.startTime) errors.startTime = 'Add a start time.';
  if (!d.endTime) errors.endTime = 'Add an end time.';
  const times = eventTimes(d);
  if (times && Date.parse(times.startsAt) <= now.getTime()) {
    errors.date = 'Pick a date and time in the future.';
  }
  return errors;
}

export type TierField = 'name' | 'price' | 'quantity' | 'saleEndsAt';
export type TierErrors = Partial<Record<TierField, string>>;

/** Errors keyed by TierDraft.key; tiers without problems are left out. */
export function tiersErrors(d: EventDraft): Record<string, TierErrors> {
  const result: Record<string, TierErrors> = {};
  const endsAt = eventTimes(d)?.endsAt;
  const names = d.tiers.map((t) => t.name.trim().toLowerCase());

  d.tiers.forEach((t, i) => {
    const e: TierErrors = {};
    const name = names[i]!;
    if (!name) e.name = 'Name this tier.';
    else if (names.indexOf(name) !== i) e.name = 'Each tier needs a different name.';

    if (!t.price) e.price = 'Enter a price, or 0 for free.';
    else if (!DIGITS.test(t.price)) e.price = 'Whole numbers only.';
    else if (Number(t.price) > MAX_TIER_PRICE) e.price = 'That price looks too high.';

    if (t.quantity && (!DIGITS.test(t.quantity) || Number(t.quantity) === 0)) {
      e.quantity = 'Enter how many, or leave it blank for no limit.';
    }

    const saleStart = localToEat(t.saleStartsAt);
    const saleEnd = localToEat(t.saleEndsAt);
    if (saleStart && saleEnd && Date.parse(saleEnd) <= Date.parse(saleStart)) {
      e.saleEndsAt = 'Sales must end after they start.';
    } else if (saleEnd && endsAt && Date.parse(saleEnd) > Date.parse(endsAt)) {
      e.saleEndsAt = 'Sales must end before the event does.';
    }

    if (Object.keys(e).length) result[t.key] = e;
  });
  return result;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;

/** "You'll receive KSh 1,146 per ticket · Eventify fee KSh 54", or null for free/blank prices. */
export function tierPayout(d: EventDraft, t: TierDraft, rateBps: number) {
  if (!DIGITS.test(t.price) || Number(t.price) === 0) return null;
  const currency = CITY_CURRENCY[d.city];
  const gross = toMinor(Number(t.price));
  const fee = feeFor(gross, rateBps);
  return { payout: formatMoney(currency, gross - fee), fee: formatMoney(currency, fee) };
}

/** Card price for the live preview: "Free", "KSh 1,200" or "From KSh 600". */
export function draftPriceLabel(d: EventDraft): string {
  const prices = d.tiers.filter((t) => DIGITS.test(t.price)).map((t) => Number(t.price));
  const paid = prices.filter((p) => p > 0);
  if (paid.length === 0) return 'Free';
  return (
    (d.tiers.length > 1 ? 'From ' : '') +
    formatMoney(CITY_CURRENCY[d.city], toMinor(Math.min(...paid)))
  );
}

/** Build the API request. Call only once detailsErrors and tiersErrors are empty. */
export function draftToRequest(d: EventDraft): CreateEventRequest {
  const times = eventTimes(d);
  if (!times) throw new Error('Event date and times are missing');
  return {
    title: d.title.trim(),
    category: d.category,
    city: d.city,
    venue: d.venue.trim(),
    ...times,
    description: d.description
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    coverImageUrl: d.coverImageUrl,
    tiers: d.tiers.map((t) => ({
      name: t.name.trim(),
      note: '',
      priceMinor: toMinor(Number(t.price)),
      quantity: t.quantity ? Number(t.quantity) : null,
      saleStartsAt: localToEat(t.saleStartsAt),
      saleEndsAt: localToEat(t.saleEndsAt),
    })),
  };
}
