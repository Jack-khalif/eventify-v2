import { eventQuerySchema, filterEvents } from '@eventify/shared';
import { organizerProfiles, publicEvents } from '@eventify/shared/fixtures';
import { delay, http, HttpResponse } from 'msw';

const notFound = () => HttpResponse.json({ error: 'Not found' }, { status: 404 });

/**
 * Mock API used until the real backend lands (Phase B). Paths and response shapes are the
 * contract the backend must match; filtering uses the same shared function the backend will.
 */
export const handlers = [
  http.get('*/api/events', async ({ request }) => {
    await delay();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = eventQuerySchema.safeParse(params);
    if (!query.success) {
      return HttpResponse.json({ error: 'Invalid query' }, { status: 400 });
    }
    return HttpResponse.json(filterEvents(publicEvents(), query.data));
  }),

  http.get('*/api/events/:slug', async ({ params }) => {
    await delay();
    const event = publicEvents().find((e) => e.slug === params.slug && e.status !== 'draft');
    return event ? HttpResponse.json(event) : notFound();
  }),

  http.get('*/api/organizers/:handle', async ({ params }) => {
    await delay();
    const profile = organizerProfiles.find((o) => o.handle === params.handle);
    return profile ? HttpResponse.json(profile) : notFound();
  }),
];
