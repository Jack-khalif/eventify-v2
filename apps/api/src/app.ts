import {
  checkoutRequestSchema,
  createEventRequestSchema,
  doorSyncRequestSchema,
  eventQuerySchema,
  filterEvents,
  markPaidRequestSchema,
  organizerApplicationRequestSchema,
  organizerStatusChangeSchema,
  overviewQuerySchema,
  rateChangeRequestSchema,
  signInStartSchema,
  signInVerifySchema,
  ticketLookupStartSchema,
  ticketLookupVerifySchema,
  type AdminMe,
  type OrderView,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
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
  resolveApproval,
  setOrganizerStatus,
  type AdminError,
} from './admin';
import {
  accountForRequest,
  endSession,
  sessionUserFor,
  startSignIn,
  verifySignIn,
  type AccountRow,
} from './auth';
import { doorList, eventForCheckinCode, syncDoor, type VerifyKey } from './checkin';
import type { Db } from './db/client';
import { auditLog, events } from './db/schema';
import { sendTicketEmail } from './email/confirmation';
import type { Mailer } from './email/mailer';
import { organizerProfile, publishedEvent, publishedEvents } from './events';
import { loadImage } from './images';
import { startLookup, verifyLookup } from './lookup';
import { cancelOrder, createOrder, getOrder, isFailure, retryPayment } from './orders';
import {
  applyToHost,
  createEvent,
  eventDashboard,
  isFailure as isEventFailure,
  organizerFor,
  organizerHome,
  recordView,
  type OrganizerRow,
} from './organizer';
import type { PaymentProvider } from './payments';
import { createRateLimiter } from './ratelimit';
import type { SmsSender } from './sms';
import { ticketView, ticketViewsForEmail } from './tickets';

export type AppDeps = {
  db: Db;
  mailer: Mailer;
  /** null = paid tickets can't be bought yet. */
  payments: PaymentProvider | null;
  /** Texts the "Find my tickets" code. null = no SMS account, so tickets are found by email only. */
  sms: SmsSender | null;
  /** Signs the backup QR on every ticket. */
  signingKey: CryptoKey;
  /** The public half of signingKey, handed to door devices so they can check QRs offline. */
  verifyKey: VerifyKey;
  siteUrl: string;
  /** Emails that are Super Admins when they sign in. */
  superAdminEmails?: readonly string[];
  /**
   * The address a request came from, for rate limits. Left out (tests), everyone shares one bucket.
   */
  clientIp?: (c: Context) => string;
  now?: () => number;
};

/**
 * The Eventify API. Paths and response shapes match the web app's mock API
 * (apps/web/src/mocks/handlers.ts), which is the contract.
 */
export function createApp({ now = Date.now, superAdminEmails = [], ...rest }: AppDeps) {
  const deps = { ...rest, superAdminEmails, now };
  const { db } = deps;
  const app = new Hono().basePath('/api');

  app.use(cors({ origin: deps.siteUrl }));
  // Posters are shown on the web app's origin, so they may be loaded from elsewhere.
  app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));

  // Limits per visitor on the things worth hammering: codes, checkouts and guessing door links.
  // Many phones share one address on mobile networks, so these are set well above honest use;
  // the tighter limits are per email and phone number (see codes.ts and orders.ts).
  const withinLimit = createRateLimiter(now);
  const clientIp = rest.clientIp ?? (() => 'local');
  const MINUTE = 60_000;
  /** The 429 to send when this visitor has done `what` too often, otherwise null. */
  const limited = (c: Context, what: string, max: number, windowMs: number) =>
    withinLimit(`${what}:${clientIp(c)}`, max, windowMs)
      ? null
      : c.json(
          { error: 'rate_limited', message: 'Too many tries. Wait a few minutes and try again.' },
          429,
        );
  // Requests are small JSON, except Create event, which carries the poster.
  const tooLarge = (c: Context) =>
    c.json({ error: 'too_large', message: 'That is too much to send at once.' }, 413);
  const smallBody = bodyLimit({ maxSize: 256 * 1024, onError: tooLarge });
  const posterBody = bodyLimit({ maxSize: 4 * 1024 * 1024, onError: tooLarge });
  app.use((c, next) => (c.req.path === '/api/organizer/events' ? posterBody : smallBody)(c, next));

  const notFound = (c: Context) => c.json({ error: 'not_found', message: 'Not found' }, 404);
  app.notFound(notFound);
  app.onError((error, c) => {
    console.error(error);
    return c.json(
      { error: 'server_error', message: 'Something went wrong. Please try again.' },
      500,
    );
  });

  /** Reply with the order, first making sure a paid one has had its tickets emailed. */
  async function orderReply(c: Context, order: OrderView, status: 200 | 201 = 200) {
    if (order.status === 'paid') await sendTicketEmail(deps, order.id);
    return c.json(order, status);
  }

  const badRequest = (c: Context, message: string) => c.json({ error: 'validation', message }, 400);

  const orderConflict = (c: Context, order: OrderView) =>
    c.json({ error: 'order_closed', message: `This order is already ${order.status}.` }, 409);

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/events', async (c) => {
    const query = eventQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'validation', message: 'Invalid query' }, 400);
    return c.json(filterEvents(await publishedEvents(db), query.data, new Date(now())));
  });

  app.get('/events/:slug', async (c) => {
    const event = await publishedEvent(db, eq(events.slug, c.req.param('slug')));
    if (!event) return notFound(c);
    await recordView(db, event.id, now());
    return c.json(event);
  });

  /** Posters. The id is random and the picture never changes, so browsers may keep it for good. */
  app.get('/images/:id', async (c) => {
    const image = await loadImage(db, c.req.param('id'));
    if (!image) return notFound(c);
    return c.body(image.bytes, 200, {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  app.get('/organizers/:handle', async (c) => {
    const profile = await organizerProfile(db, c.req.param('handle'), now());
    return profile ? c.json(profile) : notFound(c);
  });

  app.post('/orders', async (c) => {
    const stop = limited(c, 'orders', 30, 10 * MINUTE);
    if (stop) return stop;
    const body = checkoutRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'validation', message: 'Check your details and try again.' }, 400);
    }
    const result = await createOrder(deps, body.data);
    if (isFailure(result)) {
      return c.json({ error: result.error, message: result.message }, result.status);
    }
    return orderReply(c, result, 201);
  });

  app.get('/orders/:id', async (c) => {
    const order = await getOrder(deps, c.req.param('id'));
    return order ? orderReply(c, order) : notFound(c);
  });

  app.post('/orders/:id/retry', async (c) => {
    const order = await retryPayment(deps, c.req.param('id'));
    if (!order) return notFound(c);
    return order.status === 'awaiting_payment' ? c.json(order) : orderConflict(c, order);
  });

  app.post('/orders/:id/cancel', async (c) => {
    const order = await cancelOrder(deps, c.req.param('id'));
    if (!order) return notFound(c);
    return order.status === 'cancelled' ? c.json(order) : orderConflict(c, order);
  });

  app.get('/tickets/:id', async (c) => {
    const ticket = await ticketView(db, deps.signingKey, c.req.param('id'));
    return ticket ? c.json(ticket) : notFound(c);
  });

  // Sign-in: a one-time code sent by email. No passwords and no SMS.
  app.post('/auth/start', async (c) => {
    const stop = limited(c, 'codes', 20, 10 * MINUTE);
    if (stop) return stop;
    const body = signInStartSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'validation', message: 'Enter a valid email address.' }, 400);
    }
    if ((await startSignIn(deps, body.data.email)) === 'too_many') {
      return c.json(
        {
          error: 'too_many_codes',
          message: 'We just sent a code to that address. Wait a little before asking for another.',
        },
        429,
      );
    }
    return c.json({ sent: true });
  });

  app.post('/auth/verify', async (c) => {
    const stop = limited(c, 'guesses', 40, 10 * MINUTE);
    if (stop) return stop;
    const body = signInVerifySchema.safeParse(await c.req.json().catch(() => null));
    const session = body.success ? await verifySignIn(deps, body.data.email, body.data.code) : null;
    return session
      ? c.json(session)
      : c.json(
          {
            error: 'invalid_code',
            message:
              "That code isn't right or has expired. Check the email, or ask for a new code.",
          },
          422,
        );
  });

  const unauthorized = (c: Context) =>
    c.json({ error: 'unauthorized', message: 'Sign in to continue.' }, 401);
  const accountOf = (c: Context) => accountForRequest(deps, c.req.header('Authorization'));

  app.get('/auth/me', async (c) => {
    const account = await accountOf(c);
    return account ? c.json(await sessionUserFor(db, account)) : unauthorized(c);
  });

  app.post('/auth/logout', async (c) => {
    await endSession(db, c.req.header('Authorization'));
    return c.json({ ok: true });
  });

  // Tickets bought with the signed-in email: it was verified at sign-in, so no second code.
  app.get('/me/tickets', async (c) => {
    const account = await accountOf(c);
    if (!account) return unauthorized(c);
    return c.json({ tickets: await ticketViewsForEmail(db, deps.signingKey, account.email) });
  });

  // "Find my tickets" for buyers with no account: a one-time code texted to the phone they paid with.
  app.post('/ticket-lookup/start', async (c) => {
    const stop = limited(c, 'codes', 20, 10 * MINUTE);
    if (stop) return stop;
    const body = ticketLookupStartSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Enter a valid phone number.');
    const result = await startLookup(deps, body.data.phone);
    if (result === 'unavailable') {
      return c.json(
        {
          error: 'sms_unavailable',
          message:
            'We can’t text codes yet. Sign in with the email you used at checkout to see your tickets.',
        },
        503,
      );
    }
    if (result === 'too_many') {
      return c.json(
        {
          error: 'too_many_codes',
          message: 'We just sent a code to that number. Wait a little before asking for another.',
        },
        429,
      );
    }
    return c.json({ sent: true });
  });

  app.post('/ticket-lookup/verify', async (c) => {
    const stop = limited(c, 'guesses', 40, 10 * MINUTE);
    if (stop) return stop;
    const body = ticketLookupVerifySchema.safeParse(await c.req.json().catch(() => null));
    const tickets = body.success ? await verifyLookup(deps, body.data.phone, body.data.code) : null;
    return tickets
      ? c.json({ tickets })
      : c.json(
          {
            error: 'invalid_code',
            message: "That code isn't right or has expired. Check the SMS, or ask for a new code.",
          },
          422,
        );
  });

  // Organizer tools. Applying needs only a signed-in account; the rest needs an organizer.
  const forbidden = (c: Context, message = "You don't have access to that.") =>
    c.json({ error: 'forbidden', message }, 403);

  /** The signed-in organizer (whatever their status), or the response that turns everyone else away. */
  async function organizerOf(c: Context): Promise<OrganizerRow | Response> {
    const account = await accountOf(c);
    if (!account) return unauthorized(c);
    const organizer = await organizerFor(db, account);
    return organizer ?? forbidden(c, 'Organizer tools are for organizer accounts.');
  }

  app.post('/organizer/apply', async (c) => {
    const account = await accountOf(c);
    if (!account) return unauthorized(c);
    const body = organizerApplicationRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Some details are missing or invalid.');
    const user = await applyToHost(deps, account.id, body.data);
    return user
      ? c.json(user, 201)
      : c.json(
          { error: 'already_applied', message: 'This account already has an organizer profile.' },
          409,
        );
  });

  app.get('/organizer/me', async (c) => {
    const organizer = await organizerOf(c);
    if (organizer instanceof Response) return organizer;
    return c.json(await organizerHome(db, organizer, now()));
  });

  app.get('/organizer/events/:id/dashboard', async (c) => {
    const organizer = await organizerOf(c);
    if (organizer instanceof Response) return organizer;
    const dashboard = await eventDashboard(db, organizer, c.req.param('id'), now());
    return dashboard ? c.json(dashboard) : notFound(c);
  });

  // Publishing is the gate: only organizers a Super Admin has approved get past it.
  app.post('/organizer/events', async (c) => {
    const organizer = await organizerOf(c);
    if (organizer instanceof Response) return organizer;
    if (organizer.status !== 'active') {
      return c.json(
        {
          error: 'organizer_not_approved',
          message: 'Your organizer account has to be approved before you can publish events.',
        },
        403,
      );
    }
    const body = createEventRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Some event details are missing or invalid.');
    const event = await createEvent(deps, organizer, body.data);
    return isEventFailure(event)
      ? c.json({ error: event.error, message: event.message }, event.status)
      : c.json(event, 201);
  });

  // Door check-in: the link's code is the only credential door staff have.
  app.get('/checkin/:code', async (c) => {
    const code = c.req.param('code');
    const event = await eventForCheckinCode(db, code);
    if (event) return c.json(await doorList(db, deps.verifyKey, event, code, now()));
    // Only wrong links count, so a busy door is never slowed down but guessing is.
    return limited(c, 'door-links', 20, 10 * MINUTE) ?? notFound(c);
  });

  app.post('/checkin/:code/sync', async (c) => {
    const code = c.req.param('code');
    const event = await eventForCheckinCode(db, code);
    if (!event) return notFound(c);
    const body = doorSyncRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Check-in data was not in the expected format.');
    return c.json(await syncDoor(db, deps.verifyKey, event, code, body.data, now()));
  });

  // Admin portal: staff only. Agents see the organizers they onboarded; the rest is Super Admin.
  /** The signed-in staff member, or the response that turns everyone else away. */
  async function staffOf(c: Context): Promise<AdminMe | Response> {
    const account = await accountOf(c);
    if (!account) return unauthorized(c);
    const me = adminMe(account);
    if (me) actors.set(me, account);
    return me ?? forbidden(c);
  }
  const actors = new WeakMap<AdminMe, AccountRow>();
  /** Keep a record of a change made in the admin portal, once it has gone through. */
  async function audit(
    me: AdminMe,
    result: object,
    action: string,
    target: string,
    detail: Record<string, unknown>,
  ) {
    if (isAdminError(result)) return;
    const actor = actors.get(me)!;
    await db.insert(auditLog).values({
      id: `aud_${crypto.randomUUID()}`,
      at: new Date(now()),
      accountId: actor.id,
      email: actor.email,
      action,
      target,
      detail,
    });
  }
  const superAdminOnly = (c: Context, me: AdminMe) =>
    me.role === 'super_admin' ? null : forbidden(c);
  /** Answer with the result, or the error it describes. */
  const adminReply = (c: Context, result: object | AdminError) =>
    isAdminError(result)
      ? c.json({ error: result.error, message: result.message }, result.status)
      : c.json(result);

  app.get('/admin/me', async (c) => {
    const me = await staffOf(c);
    return me instanceof Response ? me : c.json(me);
  });

  app.get('/admin/overview', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    const query = overviewQuerySchema.safeParse(c.req.query());
    if (!query.success) return badRequest(c, 'Invalid filters.');
    return c.json(await overview(deps, me, query.data));
  });

  app.get('/admin/organizers', async (c) => {
    const me = await staffOf(c);
    return me instanceof Response ? me : c.json(await organizerRows(db, me));
  });

  app.get('/admin/organizers/:handle', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    return adminReply(c, await organizerDetail(deps, me, c.req.param('handle')));
  });

  app.post('/admin/organizers/:handle/rate', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    const body = rateChangeRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Check the rate and reason.');
    const result = await changeRate(deps, me, c.req.param('handle'), body.data);
    await audit(me, result, 'rate.change', c.req.param('handle'), { ...body.data, ...result });
    return adminReply(c, result);
  });

  app.post('/admin/organizers/:handle/status', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    const body = organizerStatusChangeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return badRequest(c, 'Unknown status.');
    const result = await setOrganizerStatus(deps, me, c.req.param('handle'), body.data.status);
    await audit(me, result, 'organizer.status', c.req.param('handle'), body.data);
    return adminReply(c, result);
  });

  app.get('/admin/applications', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    return superAdminOnly(c, me) ?? c.json(await applicationRows(db));
  });

  app.get('/admin/approvals', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    return superAdminOnly(c, me) ?? c.json(await approvalRows(db));
  });

  app.post('/admin/approvals/:id/:decision', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    const { id, decision } = c.req.param();
    if (decision !== 'approve' && decision !== 'reject') return notFound(c);
    const result = await resolveApproval(
      deps,
      me,
      id,
      decision === 'approve' ? 'approved' : 'rejected',
    );
    await audit(me, result, 'rate.approval', id, { decision });
    return adminReply(c, result);
  });

  app.get('/admin/agents', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    return superAdminOnly(c, me) ?? c.json(await agentRows(db));
  });

  app.get('/admin/payouts', async (c) => {
    const me = await staffOf(c);
    return me instanceof Response ? me : c.json(await payoutsFor(deps, me));
  });

  app.post('/admin/payouts/:id/paid', async (c) => {
    const me = await staffOf(c);
    if (me instanceof Response) return me;
    const body = markPaidRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return badRequest(c, body.error.issues[0]?.message ?? 'Enter the reference.');
    }
    const result = await markPaid(deps, me, c.req.param('id'), body.data.reference);
    await audit(me, result, 'payout.paid', c.req.param('id'), {
      reference: body.data.reference.toUpperCase(),
      ...('amountMinor' in result && { amountMinor: result.amountMinor, handle: result.handle }),
    });
    return adminReply(c, result);
  });

  return app;
}
