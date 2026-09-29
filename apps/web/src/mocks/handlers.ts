import { eventQuerySchema, filterEvents } from '@eventify/shared';
import { publicEvents } from '@eventify/shared/fixtures';
import { delay, http, HttpResponse } from 'msw';

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
];
