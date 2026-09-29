import { describe, expect, it } from 'vitest';
import { upcomingWeekend } from './dates';
import { filterEvents } from './discover';
import { publicEvents } from './fixtures';

const now = new Date('2026-09-29T10:00:00+03:00');
const all = publicEvents();
const slugs = (list: { slug: string }[]) => list.map((e) => e.slug);

describe('filterEvents', () => {
  it('returns every live upcoming event, soonest first', () => {
    const result = filterEvents(all, {}, now);
    expect(result).toHaveLength(10);
    expect(result[0]!.slug).toBe('sauti-sessions');
    expect(result.at(-1)!.slug).toBe('mobile-photo-masterclass');
  });

  it('filters by city', () => {
    expect(slugs(filterEvents(all, { city: 'Juba' }, now))).toEqual([
      'mizizi',
      'excel-bookkeeping-juba',
      'juba-tech-summit',
    ]);
  });

  it('treats "Free" as every-tier-free, not a category', () => {
    expect(slugs(filterEvents(all, { category: 'Free' }, now))).toEqual([
      'ieee-hackathon',
      'mizizi',
      'uon-poetry-slam',
    ]);
    // Sunday Jazz has a free Under-12 tier but a paid Regular tier, so it is not "Free".
    expect(slugs(filterEvents(all, { category: 'Free' }, now))).not.toContain('arboretum-jazz');
  });

  it('searches title, venue, organizer and city, case-insensitively', () => {
    expect(slugs(filterEvents(all, { q: 'strathmore' }, now))).toEqual(['ieee-hackathon']);
    expect(slugs(filterEvents(all, { q: 'KICC' }, now))).toEqual(['paylink-launch']);
    expect(slugs(filterEvents(all, { q: 'lens kenya' }, now))).toEqual([
      'mobile-photo-masterclass',
    ]);
  });

  it('combines filters', () => {
    expect(
      slugs(filterEvents(all, { city: 'Nairobi', category: 'Campus', q: 'poetry' }, now)),
    ).toEqual(['uon-poetry-slam']);
  });

  it('matches the design’s “This weekend” rail', () => {
    const { from, to } = upcomingWeekend(now);
    expect(slugs(filterEvents(all, { from, to }, now))).toEqual([
      'sauti-sessions',
      'ieee-hackathon',
      'mizizi',
      'arboretum-jazz',
    ]);
  });

  it('looks up a set of ids (Saved page)', () => {
    expect(slugs(filterEvents(all, { ids: 'evt_pwani,evt_hack,evt_missing' }, now))).toEqual([
      'ieee-hackathon',
      'pwani-taarab',
    ]);
  });

  it('drops ended events and drafts', () => {
    const later = new Date('2026-10-05T12:00:00+03:00');
    expect(slugs(filterEvents(all, {}, later))).not.toContain('sauti-sessions');

    const withDraft = all.map((e) =>
      e.slug === 'pwani-taarab' ? { ...e, status: 'draft' as const } : e,
    );
    expect(slugs(filterEvents(withDraft, {}, now))).not.toContain('pwani-taarab');
  });
});

describe('filterEvents by organizer', () => {
  it('returns only that organizer’s events', () => {
    expect(slugs(filterEvents(all, { organizer: 'paylink' }, now))).toEqual(['paylink-launch']);
    expect(filterEvents(all, { organizer: 'nobody' }, now)).toEqual([]);
  });
});
