import {
  importVerifyKey,
  orderViewSchema,
  organizerProfileSchema,
  publicEventSchema,
  sessionSchema,
  sessionUserSchema,
  ticketLookupResultSchema,
  ticketViewSchema,
  verifyTicketQr,
  type CheckoutRequest,
  type OrderView,
} from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { events, orders, tiers } from './db/schema';
import type { Email } from './email/mailer';
import { simulatedPayments, type PaymentProvider } from './payments';

/** Before any sample event starts, so all of them are on sale. */
const START = Date.parse('2026-10-01T12:00:00+03:00');

let database: Database;
let keys: CryptoKeyPair;
let clock = START;
let sent: Email[] = [];
let mailerFails = false;

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;

  // A small event of our own, so selling out doesn't depend on the samples' numbers.
  await database.db.insert(events).values({
    id: 'evt_tiny',
    slug: 'tiny-gig',
    title: 'Tiny Gig',
    category: 'Music & Arts',
    city: 'Nairobi',
    currency: 'KES',
    venue: 'A Small Room',
    startsAt: new Date('2026-11-01T19:00:00+03:00'),
    endsAt: new Date('2026-11-01T23:00:00+03:00'),
    description: ['Two tickets only.'],
    coverTone: 'music',
    organizerId: 'org_amani',
    status: 'live',
    rateBps: 300,
    checkinCode: 'tiny-0123456789ab',
  });
  await database.db.insert(tiers).values([
    {
      id: 'tier_tiny_paid',
      eventId: 'evt_tiny',
      position: 1,
      name: 'Entry',
      priceMinor: 50000,
      quantity: 2,
    },
    { id: 'tier_tiny_free', eventId: 'evt_tiny', position: 2, name: 'Guest list', priceMinor: 0 },
  ]);
});

afterAll(() => database.close());

beforeEach(() => {
  clock = START;
  sent = [];
  mailerFails = false;
});

function app(payments: PaymentProvider | null = simulatedPayments) {
  return createApp({
    db: database.db,
    mailer: async (email) => {
      if (mailerFails) throw new Error('mail server is down');
      sent.push(email);
    },
    payments,
    sms: null,
    signingKey: keys.privateKey,
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: 'unused-here' },
    siteUrl: 'https://tickets.test',
    superAdminEmails: ['boss@example.com'],
    clientIp: (c) => c.req.header('X-Test-Ip') ?? 'one-visitor',
    now: () => clock,
  });
}

const checkout = (over: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  eventId: 'evt_sauti',
  tierId: 'tier_sauti_regular',
  quantity: 1,
  buyer: { name: 'Amina Otieno', phone: '+254712345678', email: 'amina@example.com' },
  paymentMethod: 'mpesa',
  ...over,
});

const post = (api: ReturnType<typeof app>, path: string, body?: unknown) =>
  api.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

async function placeOrder(api: ReturnType<typeof app>, over: Partial<CheckoutRequest> = {}) {
  const res = await post(api, '/api/orders', checkout(over));
  expect(res.status).toBe(201);
  return orderViewSchema.parse(await res.json());
}

const readOrder = async (api: ReturnType<typeof app>, id: string) =>
  orderViewSchema.parse(await (await api.request(`/api/orders/${id}`)).json());

/** Place an order and let the simulated buyer approve the M-Pesa prompt. */
async function buy(api: ReturnType<typeof app>, over: Partial<CheckoutRequest> = {}) {
  const order = await placeOrder(api, over);
  clock += 5_000;
  const paid = await readOrder(api, order.id);
  expect(paid.status).toBe('paid');
  return paid;
}

describe('events', () => {
  it('lists events on sale, soonest first, in the shape the web app expects', async () => {
    const res = await app().request('/api/events');
    const list = z.array(publicEventSchema).parse(await res.json());
    expect(list.length).toBeGreaterThan(5);
    expect(list[0]!.slug).toBe('sauti-sessions');
    expect(list[0]!.startsAt).toBe('2026-10-02T19:00:00+03:00');
    expect(list[0]!.tiers.map((t) => t.name)).toContain('Regular');
  });

  it('applies the Discover filters and drops events that have ended', async () => {
    const juba = z
      .array(publicEventSchema)
      .parse(await (await app().request('/api/events?city=Juba')).json());
    expect(juba.length).toBeGreaterThan(0);
    expect(juba.every((e) => e.city === 'Juba')).toBe(true);

    clock = Date.parse('2026-10-05T00:00:00+03:00');
    const later = z
      .array(publicEventSchema)
      .parse(await (await app().request('/api/events')).json());
    expect(later.some((e) => e.slug === 'sauti-sessions')).toBe(false);
  });

  it('returns one event by slug, and 404 for an unknown one', async () => {
    const res = await app().request('/api/events/sauti-sessions');
    expect(publicEventSchema.parse(await res.json()).organizer.handle).toBe('amaniwanjiru');
    expect((await app().request('/api/events/nope')).status).toBe(404);
  });

  it('serves organizer pages, but not for applicants with nothing published', async () => {
    const res = await app().request('/api/organizers/amaniwanjiru');
    expect(organizerProfileSchema.parse(await res.json()).name).toBe('Amani Wanjiru');
    expect((await app().request('/api/organizers/mizizi')).status).toBe(200); // pending, but has an event up
    expect((await app().request('/api/organizers/nobody')).status).toBe(404);
  });
});

describe('buying a ticket', () => {
  it('waits for payment, then issues tickets and counts them as sold', async () => {
    const api = app();
    const order = await placeOrder(api, { quantity: 2 });
    expect(order).toMatchObject({
      status: 'awaiting_payment',
      totalMinor: 240000,
      rateBps: 450,
      tickets: [],
    });
    expect(order.id).toMatch(/^ord_.{20,}$/);

    clock += 2_000;
    expect((await readOrder(api, order.id)).status).toBe('awaiting_payment');
    expect(sent).toHaveLength(0);

    clock += 3_000;
    const paid = await readOrder(api, order.id);
    expect(paid.status).toBe('paid');
    expect(paid.tickets).toHaveLength(2);
    expect(paid.tickets[0]!.code).toMatch(/^EVT-SAUTI-\d{4}$/);
    expect(paid.tickets[0]!.code).not.toBe(paid.tickets[1]!.code);

    const event = publicEventSchema.parse(
      await (await api.request('/api/events/sauti-sessions')).json(),
    );
    expect(event.tiers.find((t) => t.id === 'tier_sauti_regular')!.sold).toBe(212);
  });

  it('emails the tickets once, however many times the order is read', async () => {
    const api = app();
    const paid = await buy(api, { quantity: 2 });
    await readOrder(api, paid.id);
    await readOrder(api, paid.id);

    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email.to).toBe('amina@example.com');
    expect(email.subject).toBe('Your tickets for Sauti Sessions: Afro-house Listening Night');
    expect(email.idempotencyKey).toBe(`ticket-email/${paid.id}`);
    for (const ticket of paid.tickets) {
      expect(email.text).toContain(ticket.code);
      expect(email.html).toContain(ticket.code);
      expect(email.html).toContain(`https://tickets.test/t/${ticket.id}`);
    }
    expect(email.text).toContain('Fri 2 Oct · 7:00 PM – 1:00 AM');
    expect(email.text).toContain('Paid: KSh 2,400');
    expect(email.inlineImages).toHaveLength(2);
    // PNG signature
    expect(email.inlineImages![0]!.content.subarray(1, 4).toString()).toBe('PNG');
    expect(email.html).toContain('cid:qr-2');
  });

  it('keeps the purchase when the email fails, and sends it on a later read', async () => {
    const api = app();
    mailerFails = true;
    const paid = await buy(api);
    expect(paid.tickets).toHaveLength(1);
    expect(sent).toHaveLength(0);

    mailerFails = false;
    await readOrder(api, paid.id); // too soon after the failed attempt
    expect(sent).toHaveLength(0);
    clock += 61_000;
    await readOrder(api, paid.id);
    expect(sent).toHaveLength(1);
  });

  it('gives free tickets straight away, with their email', async () => {
    const order = await placeOrder(app(), {
      eventId: 'evt_tiny',
      tierId: 'tier_tiny_free',
      paymentMethod: null,
    });
    expect(order).toMatchObject({
      status: 'paid',
      totalMinor: 0,
      paymentMethod: null,
      rateBps: 300,
    });
    expect(order.tickets[0]!.code).toMatch(/^EVT-TINY-\d{4}$/);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe('Your ticket for Tiny Gig');
    expect(sent[0]!.text).toContain('Free ticket');
  });

  it('escapes names in the email', async () => {
    await placeOrder(app(), {
      eventId: 'evt_tiny',
      tierId: 'tier_tiny_free',
      paymentMethod: null,
      buyer: { name: '<b>Bo</b> Okello', phone: '+254712345678', email: 'bo@example.com' },
    });
    expect(sent[0]!.html).not.toContain('<b>Bo</b>');
    expect(sent[0]!.html).toContain('&#60;b&#62;Bo&#60;/b&#62;');
  });

  it('serves the Live Pass for a ticket, with a QR the door can verify', async () => {
    const api = app();
    const paid = await buy(api);
    const id = paid.tickets[0]!.id;
    const ticket = ticketViewSchema.parse(await (await api.request(`/api/tickets/${id}`)).json());
    expect(ticket).toMatchObject({ tierName: 'Regular', index: 1, count: 1, checkedInAt: null });

    const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    expect(await verifyTicketQr(await importVerifyKey(publicJwk), ticket.qrPayload)).toBe(id);
    expect((await api.request('/api/tickets/nope')).status).toBe(404);
  });

  it('reports a failed payment, and lets the buyer try again or cancel', async () => {
    const api = app();
    const buyer = { name: 'Amina Otieno', phone: '+254712340000', email: 'amina@example.com' };
    const order = await placeOrder(api, { buyer });
    clock += 5_000;
    expect(await readOrder(api, order.id)).toMatchObject({
      status: 'failed',
      failureReason: 'insufficient_funds',
    });

    const retried = await post(api, `/api/orders/${order.id}/retry`);
    expect(((await retried.json()) as OrderView).status).toBe('awaiting_payment');

    const cancelled = await post(api, `/api/orders/${order.id}/cancel`);
    expect(((await cancelled.json()) as OrderView).status).toBe('cancelled');
    expect((await post(api, `/api/orders/${order.id}/cancel`)).status).toBe(200);
    expect((await post(api, `/api/orders/${order.id}/retry`)).status).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it('holds tickets for an unpaid order, and releases them when the hold runs out', async () => {
    const api = app();
    const tiny = { eventId: 'evt_tiny', tierId: 'tier_tiny_paid' };
    // A number that never answers the prompt, so the order stays unpaid.
    const slow = { name: 'Slow Payer', phone: '+254712343333', email: 'slow@example.com' };
    const held = await placeOrder(api, { ...tiny, quantity: 2, buyer: slow });

    const blocked = await post(api, '/api/orders', checkout(tiny));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: 'sold_out' });

    clock += 10 * 60_000;
    expect((await readOrder(api, held.id)).status).toBe('expired');
    const paid = await buy(api, { ...tiny, quantity: 2 });
    expect(paid.tickets).toHaveLength(2);

    const gone = await post(api, '/api/orders', checkout(tiny));
    expect(await gone.json()).toMatchObject({ error: 'sold_out' });
  });

  it('turns away bad requests, unknown events and events that have ended', async () => {
    const api = app();
    expect((await post(api, '/api/orders', { eventId: 'evt_sauti' })).status).toBe(400);
    expect((await post(api, '/api/orders', checkout({ eventId: 'evt_nope' }))).status).toBe(404);
    expect((await api.request('/api/orders/ord_nope')).status).toBe(404);

    clock = Date.parse('2026-10-05T00:00:00+03:00');
    const late = await post(api, '/api/orders', checkout());
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: 'event_ended' });
  });

  it('sells only free tickets while payments are switched off', async () => {
    const api = app(null);
    const res = await post(api, '/api/orders', checkout());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'payments_unavailable' });

    const before = await database.db.select().from(orders).where(eq(orders.eventId, 'evt_hack'));
    await placeOrder(api, {
      eventId: 'evt_hack',
      tierId: 'tier_hack_free_rsvp',
      paymentMethod: null,
    });
    const after = await database.db.select().from(orders).where(eq(orders.eventId, 'evt_hack'));
    expect(after).toHaveLength(before.length + 1);
  });
});

describe('signing in by email', () => {
  /** Ask for a code and read it out of the email that was "sent". */
  async function requestCode(api: ReturnType<typeof app>, email: string) {
    const before = sent.length;
    const res = await post(api, '/api/auth/start', { email });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(sent).toHaveLength(before + 1);
    const message = sent.at(-1)!;
    const code = /\b\d{6}\b/.exec(message.text)![0];
    expect(message.subject).toBe(`${code} is your Eventify sign-in code`);
    return { code, message };
  }

  async function signIn(api: ReturnType<typeof app>, email: string) {
    const { code } = await requestCode(api, email);
    const res = await post(api, '/api/auth/verify', { email, code });
    expect(res.status).toBe(200);
    const session = sessionSchema.parse(await res.json());
    // What a browser would keep: the cookie it can't read, next to the token it sends back.
    cookies.set(session.token, res.headers.get('Set-Cookie')!.split(';')[0]!);
    return session;
  }

  const cookies = new Map<string, string>();
  const as = (token: string) => ({
    headers: { Authorization: `Bearer ${token}`, Cookie: cookies.get(token) ?? '' },
  });

  it('keeps attendees signed in for weeks, but makes staff sign in again each day', async () => {
    const api = app();
    const attendee = await signIn(api, 'weeks@example.com');
    clock += 60_000;
    const staff = await signIn(api, 'agent@eventify.test');
    const me = (token: string) => api.request('/api/auth/me', as(token));

    clock += 11 * 60 * 60_000;
    expect((await me(staff.token)).status).toBe(200);
    clock += 2 * 60 * 60_000;
    expect((await me(staff.token)).status).toBe(401);
    expect((await api.request('/api/admin/me', as(staff.token))).status).toBe(401);
    clock += 20 * 24 * 60 * 60_000;
    expect((await me(attendee.token)).status).toBe(200);
  });

  it('keeps the session in a cookie scripts can’t read, and needs both halves of it', async () => {
    const api = app();
    const { code } = await requestCode(api, 'halves@example.com');
    const res = await post(api, '/api/auth/verify', { email: 'halves@example.com', code });
    const { token } = sessionSchema.parse(await res.json());
    const setCookie = res.headers.get('Set-Cookie')!;
    expect(setCookie).toMatch(/^eventify_session=[^;]{40,}; .*HttpOnly/);
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure'); // the site is https
    const cookie = setCookie.split(';')[0]!;
    expect(cookie).not.toContain(token);

    const me = (headers: Record<string, string>) => api.request('/api/auth/me', { headers });
    const both = { Authorization: `Bearer ${token}`, Cookie: cookie };
    expect((await me(both)).status).toBe(200);
    // The token alone is what a script could steal; the cookie alone is what another site could ride on.
    expect((await me({ Authorization: both.Authorization })).status).toBe(401);
    expect((await me({ Cookie: cookie })).status).toBe(401);
    expect((await me({ ...both, Authorization: 'Bearer someone-elses' })).status).toBe(401);

    const out = await api.request('/api/auth/logout', { method: 'POST', headers: both });
    expect(out.headers.get('Set-Cookie')).toMatch(/^eventify_session=;/);
    expect((await me(both)).status).toBe(401);
  });

  it('emails a code, and the code opens a session for a new attendee', async () => {
    const api = app();
    const { message } = await requestCode(api, ' New.Person@Example.com ');
    expect(message.to).toBe('new.person@example.com');

    const { token, user } = await signIn(api, 'someone.else@example.com');
    expect(user).toMatchObject({
      email: 'someone.else@example.com',
      role: 'attendee',
      organizer: null,
    });

    const me = await api.request('/api/auth/me', as(token));
    expect(sessionUserSchema.parse(await me.json())).toEqual(user);
    expect((await api.request('/api/auth/me')).status).toBe(401);
    expect((await api.request('/api/auth/me', as('made-up-token'))).status).toBe(401);

    expect((await api.request('/api/auth/logout', { method: 'POST', ...as(token) })).status).toBe(
      200,
    );
    expect((await api.request('/api/auth/me', as(token))).status).toBe(401);
  });

  it('signs the same person in to the same account, whatever the capitals', async () => {
    const api = app();
    const first = await signIn(api, 'repeat@example.com');
    clock += 60_000;
    const second = await signIn(api, 'Repeat@Example.com');
    expect(second.user.id).toBe(first.user.id);
    expect(second.token).not.toBe(first.token);
  });

  it('knows organizers and the configured Super Admins', async () => {
    const api = app();
    const organizer = await signIn(api, 'organizer@eventify.test');
    expect(organizer.user).toMatchObject({
      role: 'organizer',
      name: 'Amani Wanjiru',
      organizer: { handle: 'amaniwanjiru', status: 'active' },
    });
    expect((await signIn(api, 'boss@example.com')).user.role).toBe('super_admin');
  });

  it('refuses a wrong code, a used code and an old code', async () => {
    const api = app();
    const email = 'careful@example.com';
    const verify = async (code: string) =>
      (await post(api, '/api/auth/verify', { email, code })).status;

    const { code } = await requestCode(api, email);
    expect(await verify(code === '000000' ? '111111' : '000000')).toBe(422);
    expect(await verify(code)).toBe(200);
    expect(await verify(code)).toBe(422);

    clock += 60_000;
    const later = await requestCode(api, email);
    clock += 10 * 60_000;
    expect(await verify(later.code)).toBe(422);
    expect(await verify('12345')).toBe(422);
    expect((await post(api, '/api/auth/start', { email: 'not-an-email' })).status).toBe(400);
  });

  it('stops a code working after five wrong guesses', async () => {
    const api = app();
    const email = 'guessed@example.com';
    const { code } = await requestCode(api, email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await post(api, '/api/auth/verify', { email, code: wrong });
    expect((await post(api, '/api/auth/verify', { email, code })).status).toBe(422);
  });

  it('limits how often one address can be sent a code', async () => {
    const api = app();
    const email = 'flooded@example.com';
    await requestCode(api, email);
    const tooSoon = await post(api, '/api/auth/start', { email });
    expect(tooSoon.status).toBe(429);
    expect(sent).toHaveLength(1);

    for (let i = 0; i < 4; i++) {
      clock += 31_000;
      await requestCode(api, email);
    }
    clock += 31_000;
    expect((await post(api, '/api/auth/start', { email })).status).toBe(429);
    clock += 60 * 60_000;
    await requestCode(api, email);
  });

  it('shows a signed-in buyer the tickets bought with their email', async () => {
    const api = app();
    const buyer = { name: 'Zawadi Mwangi', phone: '+254712345678', email: 'Zawadi@Example.com' };
    const paid = await buy(api, { buyer, quantity: 2 });
    sent = [];

    const { token } = await signIn(api, 'zawadi@example.com');
    const res = await api.request('/api/me/tickets', as(token));
    const { tickets } = ticketLookupResultSchema.parse(await res.json());
    expect(tickets.map((t) => t.id)).toEqual(paid.tickets.map((t) => t.id));
    expect((await api.request('/api/me/tickets')).status).toBe(401);
  });
});

describe('limits on hammering', () => {
  it('stops one visitor asking for code after code, without touching anyone else', async () => {
    const api = app();
    const ask = (n: number, ip?: string) =>
      api.request('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ip && { 'X-Test-Ip': ip }) },
        body: JSON.stringify({ email: `flood-${n}@example.com` }),
      });

    for (let n = 0; n < 20; n++) expect((await ask(n)).status).toBe(200);
    const refused = await ask(20);
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toBe('rate_limited');
    expect(sent).toHaveLength(20);

    expect((await ask(21, 'someone-else')).status).toBe(200);
    clock += 10 * 60_000;
    expect((await ask(22)).status).toBe(200);
  });

  it('slows down guessing at door links, but never a door with the right link', async () => {
    const api = app();
    for (let n = 0; n < 20; n++) {
      expect((await api.request(`/api/checkin/tiny-guess${n}`)).status).toBe(404);
    }
    expect((await api.request('/api/checkin/tiny-guess20')).status).toBe(429);
    expect((await api.request('/api/checkin/tiny-0123456789ab')).status).toBe(200);
  });

  it('lets one phone hold only a few unpaid orders at a time', async () => {
    const api = app();
    const hoarder = { name: 'Hoarder', phone: '+254799000111', email: 'hoarder@example.com' };
    const order = { eventId: 'evt_sauti', tierId: 'tier_sauti_regular', buyer: hoarder };
    const held = [];
    for (let n = 0; n < 3; n++) held.push(await placeOrder(api, order));

    const refused = await post(api, '/api/orders', checkout(order));
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: string }).error).toBe('too_many_open_orders');
    // Someone else is not affected, and cancelling one frees a place.
    await placeOrder(api, { eventId: 'evt_sauti', tierId: 'tier_sauti_regular' });
    expect((await post(api, `/api/orders/${held[0]!.id}/cancel`)).status).toBe(200);
    await placeOrder(api, order);
  });
});
