import {
  checkoutRequestSchema,
  createEventRequestSchema,
  doorSyncRequestSchema,
  markPaidRequestSchema,
  organizerApplicationRequestSchema,
  organizerStatusChangeSchema,
  rateChangeRequestSchema,
  signInStartSchema,
  signInVerifySchema,
  type AdminMe,
  type Organizer,
  eventQuerySchema,
  filterEvents,
  ticketLookupStartSchema,
  ticketLookupVerifySchema,
  type OrderView,
} from '@eventify/shared';
import { organizerProfiles } from '@eventify/shared/fixtures';
import { accountForToken, applyToHost, endSession, sessionUser, verifySignIn } from './auth';
import { allOrganizers, findOrganizer } from './organizers';
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
  applicationRows,
  approvalRows,
  changeRate,
  isAdminError,
  markPaid,
  organizerDetail,
  organizerRows,
  overview,
  payoutsFor,
  resolve,
  setOrganizerStatus,
  type AdminError,
} from './admin';
import { doorList, scannerCheckIns, syncDoor } from './checkin';
import {
  allEvents,
  createEvent,
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

const unauthorized = () =>
  HttpResponse.json({ error: 'unauthorized', message: 'Sign in to continue.' }, { status: 401 });

const forbidden = (message = "You don't have access to that.") =>
  HttpResponse.json({ error: 'forbidden', message }, { status: 403 });

const tokenOf = (request: Request) =>
  /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? null;

const accountOf = (request: Request) => {
  const token = tokenOf(request);
  return token ? accountForToken(token) : null;
};

/** The signed-in staff member, or the response that turns everyone else away. */
function staffOf(request: Request): AdminMe | Response {
  const account = accountOf(request);
  if (!account) return unauthorized();
  return adminMe(account) ?? forbidden();
}

/** The signed-in organizer (whatever their status), or the response that turns everyone else away. */
function organizerOf(request: Request): Organizer | Response {
  const account = accountOf(request);
  if (!account) return unauthorized();
  const organizer = account.organizerId ? findOrganizer(account.organizerId) : undefined;
  return organizer ?? forbidden('Organizer tools are for organizer accounts.');
}

const superAdminOnly = (me: AdminMe) => (me.role === 'super_admin' ? null : forbidden());

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
    const o = allOrganizers().find((x) => x.handle === params.handle);
    // No public page for an applicant until they are approved or have an event up.
    const hidden =
      (o?.status === 'pending' || o?.status === 'rejected') &&
      !allEvents().some((e) => e.organizerId === o.id);
    if (!o || hidden) return notFound();
    const sample = organizerProfiles.find((p) => p.id === o.id);
    return HttpResponse.json(
      sample ?? {
        id: o.id,
        handle: o.handle,
        name: o.name,
        type: o.type,
        verified: o.verified,
        bio: o.bio,
        bannerTone: o.bannerTone,
        pastEvents: [],
      },
    );
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

  // Sign-in: a one-time code to the phone, as for "Find my tickets".
  http.post('*/api/auth/start', async ({ request }) => {
    await delay();
    const body = signInStartSchema.safeParse(await request.json());
    return body.success
      ? HttpResponse.json({ sent: true })
      : badRequest('Enter a valid phone number.');
  }),

  http.post('*/api/auth/verify', async ({ request }) => {
    await delay();
    const body = signInVerifySchema.safeParse(await request.json());
    const session = body.success ? verifySignIn(body.data.phone, body.data.code) : null;
    return session
      ? HttpResponse.json(session)
      : HttpResponse.json(
          { error: 'invalid_code', message: "That code isn't right. Check the SMS and try again." },
          { status: 422 },
        );
  }),

  http.get('*/api/auth/me', async ({ request }) => {
    await delay();
    const account = accountOf(request);
    return account ? HttpResponse.json(sessionUser(account)) : unauthorized();
  }),

  http.post('*/api/auth/logout', async ({ request }) => {
    await delay();
    const token = tokenOf(request);
    if (token) endSession(token);
    return HttpResponse.json({ ok: true });
  }),

  // Tickets bought with the signed-in phone: it was verified at sign-in, so no second code.
  http.get('*/api/me/tickets', async ({ request }) => {
    await delay();
    const account = accountOf(request);
    if (!account) return unauthorized();
    return HttpResponse.json({ tickets: await ticketsForPhone(account.phone, allEvents()) });
  }),

  http.post('*/api/organizer/apply', async ({ request }) => {
    await delay();
    const account = accountOf(request);
    if (!account) return unauthorized();
    const body = organizerApplicationRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest('Some details are missing or invalid.');
    const user = applyToHost(account, body.data);
    return user
      ? HttpResponse.json(user, { status: 201 })
      : HttpResponse.json(
          { error: 'already_applied', message: 'This account already has an organizer profile.' },
          { status: 409 },
        );
  }),

  http.get('*/api/organizer/me', async ({ request }) => {
    await delay();
    const organizer = organizerOf(request);
    if (organizer instanceof Response) return organizer;
    return HttpResponse.json(organizerHome(organizer.id));
  }),

  http.get('*/api/organizer/events/:id/dashboard', async ({ params, request }) => {
    await delay();
    const organizer = organizerOf(request);
    if (organizer instanceof Response) return organizer;
    const id = String(params.id);
    const dashboard = eventDashboard(organizer.id, id, scannerCheckIns(id));
    return dashboard ? HttpResponse.json(dashboard) : notFound();
  }),

  // Publishing is the gate: only organizers a Super Admin has approved get past it.
  http.post('*/api/organizer/events', async ({ request }) => {
    await delay();
    const organizer = organizerOf(request);
    if (organizer instanceof Response) return organizer;
    if (organizer.status !== 'active') {
      return HttpResponse.json(
        {
          error: 'organizer_not_approved',
          message: 'Your organizer account has to be approved before you can publish events.',
        },
        { status: 403 },
      );
    }
    const body = createEventRequestSchema.safeParse(await request.json());
    if (!body.success) {
      return HttpResponse.json(
        { error: 'validation', message: 'Some event details are missing or invalid.' },
        { status: 400 },
      );
    }
    return HttpResponse.json(createEvent(body.data, organizer.id), { status: 201 });
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

  // Admin portal: staff only. Agents see the organizers they onboarded; the rest is Super Admin.
  http.get('*/api/admin/me', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    return me instanceof Response ? me : HttpResponse.json(me);
  }),

  http.get('*/api/admin/overview', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    const params = Object.fromEntries(new URL(request.url).searchParams);
    try {
      return HttpResponse.json(overview(me, params));
    } catch {
      return badRequest('Invalid filters.');
    }
  }),

  http.get('*/api/admin/organizers', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    return me instanceof Response ? me : HttpResponse.json(organizerRows(me));
  }),

  http.get('*/api/admin/organizers/:handle', async ({ params, request }) => {
    await delay();
    const me = staffOf(request);
    return me instanceof Response ? me : adminReply(organizerDetail(me, String(params.handle)));
  }),

  http.post('*/api/admin/organizers/:handle/rate', async ({ params, request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    const body = rateChangeRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest('Check the rate and reason.');
    return adminReply(changeRate(me, String(params.handle), body.data));
  }),

  http.post('*/api/admin/organizers/:handle/status', async ({ params, request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    const body = organizerStatusChangeSchema.safeParse(await request.json());
    if (!body.success) return badRequest('Unknown status.');
    return adminReply(setOrganizerStatus(me, String(params.handle), body.data.status));
  }),

  http.get('*/api/admin/applications', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    return superAdminOnly(me) ?? HttpResponse.json(applicationRows());
  }),

  http.get('*/api/admin/approvals', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    return superAdminOnly(me) ?? HttpResponse.json(approvalRows());
  }),

  http.post('*/api/admin/approvals/:id/:decision', async ({ params, request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    const decision =
      params.decision === 'approve' ? 'approved' : params.decision === 'reject' ? 'rejected' : null;
    if (!decision) return notFound();
    return adminReply(resolve(me, String(params.id), decision));
  }),

  http.get('*/api/admin/agents', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    return superAdminOnly(me) ?? HttpResponse.json(agentRows());
  }),

  http.get('*/api/admin/payouts', async ({ request }) => {
    await delay();
    const me = staffOf(request);
    return me instanceof Response ? me : HttpResponse.json(payoutsFor(me));
  }),

  http.post('*/api/admin/payouts/:id/paid', async ({ params, request }) => {
    await delay();
    const me = staffOf(request);
    if (me instanceof Response) return me;
    const body = markPaidRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest(body.error.issues[0]?.message ?? 'Enter the reference.');
    return adminReply(markPaid(me, String(params.id), body.data.reference));
  }),
];
