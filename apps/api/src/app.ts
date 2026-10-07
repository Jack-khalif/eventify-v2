import {
  checkoutRequestSchema,
  eventQuerySchema,
  filterEvents,
  signInStartSchema,
  signInVerifySchema,
  type OrderView,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { accountForRequest, endSession, sessionUserFor, startSignIn, verifySignIn } from './auth';
import type { Db } from './db/client';
import { events } from './db/schema';
import { sendTicketEmail } from './email/confirmation';
import type { Mailer } from './email/mailer';
import { organizerProfile, publishedEvent, publishedEvents } from './events';
import { cancelOrder, createOrder, getOrder, isFailure, retryPayment } from './orders';
import type { PaymentProvider } from './payments';
import { ticketView, ticketViewsForEmail } from './tickets';

export type AppDeps = {
  db: Db;
  mailer: Mailer;
  /** null = paid tickets can't be bought yet. */
  payments: PaymentProvider | null;
  /** Signs the backup QR on every ticket. */
  signingKey: CryptoKey;
  siteUrl: string;
  /** Emails that are Super Admins when they sign in. */
  superAdminEmails?: readonly string[];
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
    return event ? c.json(event) : notFound(c);
  });

  app.get('/organizers/:handle', async (c) => {
    const profile = await organizerProfile(db, c.req.param('handle'), now());
    return profile ? c.json(profile) : notFound(c);
  });

  app.post('/orders', async (c) => {
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

  return app;
}
