import {
  checkoutRequestSchema,
  createEventRequestSchema,
  doorSyncRequestSchema,
  markPaidRequestSchema,
  rateChangeRequestSchema,
  adminRoleSchema,
  eventQuerySchema,
  filterEvents,
  ticketLookupStartSchema,
  ticketLookupVerifySchema,
  type OrderView,
} from '@eventify/shared';
import { organizerProfiles } from '@eventify/shared/fixtures';
import { delay, http, HttpResponse, type JsonBodyType } from 'msw';
import {
  cancelOrder,
  createOrder,
  getOrder,
  getTicket,
  retryPayment,
  ticketsForPhone,
} from './orders';
import {
  adminMe,
  agentRows,
  approvalRows,
  changeRate,
  isAdminError,
  markPaid,
  organizerDetail,
  organizerRows,
  overview,
  payoutsFor,
  resolve,
  setDemoRole,
  type AdminError,
} from './admin';
import { doorList, scannerCheckIns, syncDoor } from './checkin';
import {
  allEvents,
  createEvent,
  DEMO_ORGANIZER_ID,
  eventDashboard,
  eventForCheckinCode,
  organizerHome,
} from './events';
import { TEST_LOOKUP_CODE } from './testPhones';

const notFound = () =>
  HttpResponse.json({ error: 'not_found', message: 'Not found' }, { status: 404 });

const adminError = (e: AdminError) =>
  HttpResponse.json({ error: e.error, message: e.message }, { status: e.status });

/** Answer with the result, or the error it describes. */
const adminReply = <T extends JsonBodyType>(result: T | AdminError) =>
  isAdminError(result) ? adminError(result) : HttpResponse.json(result);

const superAdminOnly = () =>
  adminMe().role === 'super_admin'
    ? null
    : adminError({ status: 403, error: 'forbidden', message: "You don't have access to that." });

const badRequest = (message: string) =>
  HttpResponse.json({ error: 'validation', message }, { status: 400 });

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
    return HttpResponse.json(filterEvents(allEvents(), query.data));
  }),

  http.get('*/api/events/:slug', async ({ params }) => {
    await delay();
    const event = allEvents().find((e) => e.slug === params.slug && e.status !== 'draft');
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
    const event = allEvents().find((e) => e.id === body.data.eventId);
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
    const order = getOrder(String(params.id), allEvents());
    return order ? HttpResponse.json(order) : notFound();
  }),

  http.post('*/api/orders/:id/retry', async ({ params }) => {
    await delay();
    const order = retryPayment(String(params.id), allEvents());
    if (!order) return notFound();
    return order.status === 'awaiting_payment' ? HttpResponse.json(order) : orderConflict(order);
  }),

  http.post('*/api/orders/:id/cancel', async ({ params }) => {
    await delay();
    const order = cancelOrder(String(params.id), allEvents());
    if (!order) return notFound();
    return order.status === 'cancelled' ? HttpResponse.json(order) : orderConflict(order);
  }),

  http.get('*/api/tickets/:id', async ({ params }) => {
    await delay();
    const ticket = await getTicket(String(params.id), allEvents());
    return ticket ? HttpResponse.json(ticket) : notFound();
  }),

  // Always "sent", whether or not the number has tickets, so nobody can probe which numbers bought.
  http.post('*/api/ticket-lookup/start', async ({ request }) => {
    await delay();
    const body = ticketLookupStartSchema.safeParse(await request.json());
    if (!body.success) {
      return HttpResponse.json(
        { error: 'validation', message: 'Enter a valid phone number.' },
        { status: 400 },
      );
    }
    return HttpResponse.json({ sent: true });
  }),

  http.post('*/api/ticket-lookup/verify', async ({ request }) => {
    await delay();
    const body = ticketLookupVerifySchema.safeParse(await request.json());
    if (!body.success || body.data.code !== TEST_LOOKUP_CODE) {
      return HttpResponse.json(
        { error: 'invalid_code', message: "That code isn't right. Check the SMS and try again." },
        { status: 422 },
      );
    }
    return HttpResponse.json({ tickets: await ticketsForPhone(body.data.phone, allEvents()) });
  }),

  // Organizer tools act as the demo organizer until sign-in exists (Phase A9).
  http.get('*/api/organizer/me', async () => {
    await delay();
    return HttpResponse.json(organizerHome(DEMO_ORGANIZER_ID));
  }),

  http.get('*/api/organizer/events/:id/dashboard', async ({ params }) => {
    await delay();
    const id = String(params.id);
    const dashboard = eventDashboard(DEMO_ORGANIZER_ID, id, scannerCheckIns(id));
    return dashboard ? HttpResponse.json(dashboard) : notFound();
  }),

  http.post('*/api/organizer/events', async ({ request }) => {
    await delay();
    const body = createEventRequestSchema.safeParse(await request.json());
    if (!body.success) {
      return HttpResponse.json(
        { error: 'validation', message: 'Some event details are missing or invalid.' },
        { status: 400 },
      );
    }
    return HttpResponse.json(createEvent(body.data, DEMO_ORGANIZER_ID), { status: 201 });
  }),

  // Door check-in: the link's code is the only credential door staff have.
  http.get('*/api/checkin/:code', async ({ params }) => {
    await delay();
    const code = String(params.code);
    const event = eventForCheckinCode(code);
    return event ? HttpResponse.json(doorList(event, code)) : notFound();
  }),

  http.post('*/api/checkin/:code/sync', async ({ params, request }) => {
    await delay();
    const code = String(params.code);
    const event = eventForCheckinCode(code);
    if (!event) return notFound();
    const body = doorSyncRequestSchema.safeParse(await request.json());
    if (!body.success) {
      return HttpResponse.json(
        { error: 'validation', message: 'Check-in data was not in the expected format.' },
        { status: 400 },
      );
    }
    return HttpResponse.json(syncDoor(event, code, body.data));
  }),

  // Admin portal. Who is signed in is a demo switch until sign-in exists (Phase A9).
  http.get('*/api/admin/me', async () => {
    await delay();
    return HttpResponse.json(adminMe());
  }),

  http.post('*/api/admin/demo-role', async ({ request }) => {
    await delay();
    const body = adminRoleSchema.safeParse(((await request.json()) as { role?: unknown }).role);
    return body.success ? HttpResponse.json(setDemoRole(body.data)) : badRequest('Unknown role.');
  }),

  http.get('*/api/admin/overview', async ({ request }) => {
    await delay();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    try {
      return HttpResponse.json(overview(adminMe(), params));
    } catch {
      return badRequest('Invalid filters.');
    }
  }),

  http.get('*/api/admin/organizers', async () => {
    await delay();
    return HttpResponse.json(organizerRows(adminMe()));
  }),

  http.get('*/api/admin/organizers/:handle', async ({ params }) => {
    await delay();
    return adminReply(organizerDetail(adminMe(), String(params.handle)));
  }),

  http.post('*/api/admin/organizers/:handle/rate', async ({ params, request }) => {
    await delay();
    const body = rateChangeRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest('Check the rate and reason.');
    return adminReply(changeRate(adminMe(), String(params.handle), body.data));
  }),

  http.get('*/api/admin/approvals', async () => {
    await delay();
    return superAdminOnly() ?? HttpResponse.json(approvalRows());
  }),

  http.post('*/api/admin/approvals/:id/:decision', async ({ params }) => {
    await delay();
    const decision =
      params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : null;
    if (!decision) return notFound();
    return adminReply(resolve(adminMe(), String(params.id), decision));
  }),

  http.get('*/api/admin/agents', async () => {
    await delay();
    return superAdminOnly() ?? HttpResponse.json(agentRows());
  }),

  http.get('*/api/admin/payouts', async () => {
    await delay();
    return HttpResponse.json(payoutsFor(adminMe()));
  }),

  http.post('*/api/admin/payouts/:id/paid', async ({ params, request }) => {
    await delay();
    const body = markPaidRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest(body.error.issues[0]?.message ?? 'Enter the reference.');
    return adminReply(markPaid(adminMe(), String(params.id), body.data.reference));
  }),
];
