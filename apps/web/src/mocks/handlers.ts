import {
  checkoutRequestSchema,
  eventQuerySchema,
  filterEvents,
  type OrderView,
} from '@eventify/shared';
import { organizerProfiles, publicEvents } from '@eventify/shared/fixtures';
import { delay, http, HttpResponse } from 'msw';
import { cancelOrder, createOrder, getOrder, retryPayment } from './orders';

const notFound = () =>
  HttpResponse.json({ error: 'not_found', message: 'Not found' }, { status: 404 });

const orderConflict = (order: OrderView) =>
  HttpResponse.json(
    { error: 'order_closed', message: `This order is already ${order.status}.` },
    { status: 409 },
  );

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

  http.post('*/api/orders', async ({ request }) => {
    await delay();
    const body = checkoutRequestSchema.safeParse(await request.json());
    if (!body.success) {
      return HttpResponse.json(
        { error: 'validation', message: 'Check your details and try again.' },
        { status: 400 },
      );
    }
    const event = publicEvents().find((e) => e.id === body.data.eventId);
    if (!event) return notFound();
    const result = createOrder(event, body.data);
    if ('error' in result) {
      return HttpResponse.json(
        { error: result.error, message: result.message },
        { status: result.status },
      );
    }
    return HttpResponse.json(result, { status: 201 });
  }),

  http.get('*/api/orders/:id', async ({ params }) => {
    await delay();
    const order = getOrder(String(params.id), publicEvents());
    return order ? HttpResponse.json(order) : notFound();
  }),

  http.post('*/api/orders/:id/retry', async ({ params }) => {
    await delay();
    const order = retryPayment(String(params.id), publicEvents());
    if (!order) return notFound();
    return order.status === 'awaiting_payment' ? HttpResponse.json(order) : orderConflict(order);
  }),

  http.post('*/api/orders/:id/cancel', async ({ params }) => {
    await delay();
    const order = cancelOrder(String(params.id), publicEvents());
    if (!order) return notFound();
    return order.status === 'cancelled' ? HttpResponse.json(order) : orderConflict(order);
  }),
];
