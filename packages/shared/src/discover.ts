import { z } from 'zod';
import { categorySchema, citySchema } from './enums';
import { isFreeEvent, type PublicEvent } from './schemas';

/** "Free" is a filter, not a stored category: it matches events where every tier is free. */
export const discoverCategorySchema = z.union([categorySchema, z.literal('Free')]);
export type DiscoverCategory = z.infer<typeof discoverCategorySchema>;

/** Query parameters for GET /api/events. */
export const eventQuerySchema = z.object({
  city: citySchema.optional(),
  category: discoverCategorySchema.optional(),
  q: z.string().trim().max(100).optional(),
  /** Only events starting in [from, to). */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  /** Comma-separated event ids, e.g. for the Saved page. */
  ids: z.string().optional(),
});
export type EventQuery = z.infer<typeof eventQuerySchema>;

/**
 * The Discover filter rules from the design, shared by the mock API and the real backend.
 * Ended events are dropped and the rest are sorted soonest first.
 */
export function filterEvents(
  events: PublicEvent[],
  query: EventQuery,
  now: Date = new Date(),
): PublicEvent[] {
  const q = query.q?.toLowerCase();
  const ids = query.ids ? new Set(query.ids.split(',').filter(Boolean)) : null;
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;

  return events
    .filter((e) => e.status === 'live' && Date.parse(e.endsAt) > now.getTime())
    .filter((e) => !ids || ids.has(e.id))
    .filter((e) => !query.city || e.city === query.city)
    .filter(
      (e) =>
        !query.category ||
        (query.category === 'Free' ? isFreeEvent(e) : e.category === query.category),
    )
    .filter((e) => {
      const start = Date.parse(e.startsAt);
      return (from === null || start >= from) && (to === null || start < to);
    })
    .filter(
      (e) => !q || [e.title, e.venue, e.organizer.name, e.city].join(' ').toLowerCase().includes(q),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
