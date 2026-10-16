import { orderViewSchema, type CheckoutRequest } from '@eventify/shared';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { openLocalDatabase, type Database } from './db/client';
import { seedSamples } from './db/samples';
import { events, paymentAttempts, tiers } from './db/schema';
import type { Email } from './email/mailer';
import type { PaymentCheck, PaymentProvider, PaymentRequest, RequestResult } from './payments';
import { failureFrom, paystackPayments } from './paystack';

/** The payment rules in orders.ts, driven through a provider whose answers each test decides. */

const START = Date.parse('2026-10-01T12:00:00+03:00');
const MINUTE = 60_000;

let database: Database;
let keys: CryptoKeyPair;
let clock = START;
let emails: Email[] = [];

/** What the fake provider will say about each reference, and what it was asked to do. */
let answers = new Map<string, PaymentCheck>();
let requests: PaymentRequest[] = [];
let refunds: string[] = [];
let refundWorks = true;
let refuseRequests: RequestResult | null = null;

const fake: PaymentProvider = {
  request: async (r) => {
    requests.push(r);
    if (refuseRequests) return refuseRequests;
    return {
      ok: true,
      paymentUrl: r.method === 'card' ? `https://checkout.paystack.test/${r.reference}` : null,
    };
  },
  check: async (a) => answers.get(a.reference) ?? { state: 'pending' },
  refund: async (reference) => {
    refunds.push(reference);
    return refundWorks;
  },
  webhookReference: (body, header) =>
    header('x-test-signature') === 'genuine'
      ? (JSON.parse(body) as { data: { reference: string } }).data.reference
      : null,
  checkAfterMs: 20_000,
  checkEveryMs: 10_000,
  promptTimeoutMs: 3 * MINUTE,
};

beforeAll(async () => {
  database = openLocalDatabase();
  await database.migrate();
  await seedSamples(database.db);
  keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
  await database.db.insert(events).values({
    id: 'evt_duo',
    slug: 'duo-gig',
    title: 'Duo Gig',
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
    checkinCode: 'duo-0123456789ab',
  });
  await database.db.insert(tiers).values({
    id: 'tier_duo',
    eventId: 'evt_duo',
    position: 1,
    name: 'Entry',
    priceMinor: 50000,
    quantity: 2,
  });
});

afterAll(() => database.close());

beforeEach(() => {
  clock = START;
  emails = [];
  answers = new Map();
  requests = [];
  refunds = [];
  refundWorks = true;
  refuseRequests = null;
});

const api = () =>
  createApp({
    db: database.db,
    mailer: async (email) => {
      emails.push(email);
    },
    payments: fake,
    sms: null,
    signingKey: keys.privateKey,
    verifyKey: { kty: 'OKP', crv: 'Ed25519', x: 'unused-here' },
    siteUrl: 'https://tickets.test',
    now: () => clock,
  });

/** A new phone per order, so the cap on open orders per phone never gets in the way. */
let phones = 0;
const nextPhone = () => `+2547${String(10_000_000 + ++phones).slice(-8)}`;

const checkout = (over: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  eventId: 'evt_sauti',
  tierId: 'tier_sauti_regular',
  quantity: 1,
  buyer: { name: 'Amina Otieno', phone: nextPhone(), email: 'amina@example.com' },
  paymentMethod: 'mpesa',
  ...over,
});

const post = (app: ReturnType<typeof api>, path: string, body: unknown = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function placeOrder(app: ReturnType<typeof api>, over: Partial<CheckoutRequest> = {}) {
  const res = await post(app, '/api/orders', checkout(over));
  expect(res.status).toBe(201);
  return orderViewSchema.parse(await res.json());
}

const readOrder = async (app: ReturnType<typeof api>, id: string) =>
  orderViewSchema.parse(await (await app.request(`/api/orders/${id}`)).json());

const webhook = (app: ReturnType<typeof api>, reference: string, signature = 'genuine') =>
  app.request('/api/webhooks/paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-signature': signature },
    body: JSON.stringify({ event: 'charge.success', data: { reference } }),
  });

const paid = (amountMinor: number, currency = 'KES'): PaymentCheck => ({
  state: 'paid',
  amountMinor,
  currency,
});

const attemptRow = async (reference: string) =>
  (await database.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, reference)))[0]!;

describe('sending the prompt', () => {
  it('asks for the order total once the tickets are held, with a reference Paystack accepts', async () => {
    const order = await placeOrder(api(), { quantity: 2 });
    expect(order.status).toBe('awaiting_payment');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'mpesa',
      amountMinor: 240000,
      currency: 'KES',
      email: 'amina@example.com',
      orderId: order.id,
      returnUrl: `https://tickets.test/e/sauti-sessions/checkout/${order.id}`,
    });
    expect(requests[0]!.phone).toBe(order.buyer.phone);
    expect(requests[0]!.reference).toMatch(/^[A-Za-z0-9-]+$/);
  });

  it('fails the order straight away when the provider refuses the prompt', async () => {
    refuseRequests = { ok: false, failure: 'unknown', detail: 'Invalid phone' };
    const order = await placeOrder(api());
    expect(order).toMatchObject({ status: 'failed', failureReason: 'unknown' });
  });

  it('gives card orders the provider checkout page, and sells US dollar events by card only', async () => {
    const app = api();
    const order = await placeOrder(app, {
      eventId: 'evt_summit',
      tierId: 'tier_summit_regular',
      paymentMethod: 'card',
      buyer: { name: 'Deng Garang', phone: '+211922456781', email: 'deng@example.com' },
    });
    expect(order).toMatchObject({ currency: 'USD', totalMinor: 3500, status: 'awaiting_payment' });
    expect(order.paymentUrl).toBe(`https://checkout.paystack.test/${requests[0]!.reference}`);

    const mpesa = await post(
      app,
      '/api/orders',
      checkout({ eventId: 'evt_summit', tierId: 'tier_summit_regular' }),
    );
    expect(await mpesa.json()).toMatchObject({ error: 'payment_method_unavailable' });
  });
});

describe('confirming a payment', () => {
  it('turns away webhooks without a genuine signature', async () => {
    const app = api();
    const order = await placeOrder(app);
    answers.set(requests[0]!.reference, paid(120000));
    expect((await webhook(app, requests[0]!.reference, 'forged')).status).toBe(401);
    expect((await readOrder(app, order.id)).status).toBe('awaiting_payment');
  });

  it('issues and emails tickets on a confirmed webhook, once however often it comes', async () => {
    const app = api();
    const order = await placeOrder(app);
    const ref = requests[0]!.reference;
    answers.set(ref, paid(120000));
    expect((await webhook(app, ref)).status).toBe(200);
    expect((await webhook(app, ref)).status).toBe(200);

    const done = await readOrder(app, order.id);
    expect(done.status).toBe('paid');
    expect(done.tickets).toHaveLength(1);
    expect(emails.map((e) => e.subject)).toEqual([
      'Your ticket for Sauti Sessions: Afro-house Listening Night',
    ]);
    expect(refunds).toEqual([]);
  });

  it('ignores a webhook until the provider itself says the payment went through', async () => {
    const app = api();
    const order = await placeOrder(app);
    await webhook(app, requests[0]!.reference); // still pending when we ask
    expect((await readOrder(app, order.id)).status).toBe('awaiting_payment');
  });

  it('asks the provider itself when no webhook comes, but not on every read', async () => {
    const app = api();
    const order = await placeOrder(app);
    const ref = requests[0]!.reference;
    answers.set(ref, paid(120000));

    clock += 10_000; // too soon to ask
    expect((await readOrder(app, order.id)).status).toBe('awaiting_payment');
    clock += 15_000;
    expect((await readOrder(app, order.id)).status).toBe('paid');
  });

  it('checks a card payment as soon as the buyer is back', async () => {
    const app = api();
    const order = await placeOrder(app, { paymentMethod: 'card' });
    answers.set(requests[0]!.reference, paid(120000));
    clock += 1_000;
    const done = await readOrder(app, order.id);
    expect(done).toMatchObject({ status: 'paid', paymentUrl: null });
  });
});

describe('failed payments', () => {
  it('shows why it failed, read from the provider', async () => {
    const app = api();
    const order = await placeOrder(app);
    answers.set(requests[0]!.reference, {
      state: 'failed',
      failure: 'insufficient_funds',
      detail: 'Insufficient balance',
    });
    await webhook(app, requests[0]!.reference);
    expect(await readOrder(app, order.id)).toMatchObject({
      status: 'failed',
      failureReason: 'insufficient_funds',
    });
    expect((await attemptRow(requests[0]!.reference)).detail).toBe('Insufficient balance');
  });

  it("doesn't fail the order for an old prompt while a newer one is out", async () => {
    const app = api();
    const order = await placeOrder(app);
    clock += 30_000; // "Resend prompt"
    await post(app, `/api/orders/${order.id}/retry`);
    const [first, second] = requests.map((r) => r.reference);
    expect(first).not.toBe(second);

    answers.set(first!, { state: 'failed', failure: 'cancelled_by_user', detail: 'Cancelled' });
    await webhook(app, first!);
    expect((await readOrder(app, order.id)).status).toBe('awaiting_payment');
  });

  it('times out an unanswered M-Pesa prompt, but still honours it if the money comes in', async () => {
    const app = api();
    const order = await placeOrder(app);
    clock += 3 * MINUTE;
    expect(await readOrder(app, order.id)).toMatchObject({
      status: 'failed',
      failureReason: 'timeout',
    });

    answers.set(requests[0]!.reference, paid(120000));
    await webhook(app, requests[0]!.reference);
    expect((await readOrder(app, order.id)).status).toBe('paid');
  });
});

describe('money that arrives when it should not', () => {
  it('still issues tickets for a late payment if there are enough left', async () => {
    const app = api();
    const order = await placeOrder(app);
    clock += 11 * MINUTE;
    expect((await readOrder(app, order.id)).status).toBe('expired');

    answers.set(requests[0]!.reference, paid(120000));
    await webhook(app, requests[0]!.reference);
    const done = await readOrder(app, order.id);
    expect(done.status).toBe('paid');
    expect(done.tickets).toHaveLength(1);
    expect(refunds).toEqual([]);
  });

  it('refunds a late payment when the tickets have gone, and tells the buyer', async () => {
    const app = api();
    const duo = { eventId: 'evt_duo', tierId: 'tier_duo', quantity: 2 };
    const slow = await placeOrder(app, duo);
    const slowRef = requests[0]!.reference;
    await post(app, `/api/orders/${slow.id}/cancel`);

    const other = await placeOrder(app, {
      ...duo,
      buyer: { name: 'Baraka Mwangi', phone: nextPhone(), email: 'baraka@example.com' },
    });
    answers.set(requests[1]!.reference, paid(100000));
    await webhook(app, requests[1]!.reference);
    expect((await readOrder(app, other.id)).status).toBe('paid');

    answers.set(slowRef, paid(100000));
    await webhook(app, slowRef);
    expect((await readOrder(app, slow.id)).status).toBe('refunded');
    expect(refunds).toEqual([slowRef]);
    expect((await attemptRow(slowRef)).refundStatus).toBe('requested');
    const email = emails.find((e) => e.to === 'amina@example.com')!;
    expect(email.subject).toBe('Refund of KSh 1,000 for Duo Gig');
    expect(email.text).toContain('after your order had closed');
  });

  it('refunds the second payment when the buyer paid twice', async () => {
    const app = api();
    const order = await placeOrder(app);
    await post(app, `/api/orders/${order.id}/retry`);
    const [first, second] = requests.map((r) => r.reference);
    answers.set(first!, paid(120000));
    answers.set(second!, paid(120000));
    await webhook(app, first!);
    await webhook(app, second!);

    const done = await readOrder(app, order.id);
    expect(done.status).toBe('paid');
    expect(done.tickets).toHaveLength(1);
    expect(refunds).toEqual([second]);
    expect((await attemptRow(second!)).refundReason).toBe('duplicate');
  });

  it("refunds a payment that doesn't match the order, without issuing tickets", async () => {
    const app = api();
    const order = await placeOrder(app);
    answers.set(requests[0]!.reference, paid(100));
    await webhook(app, requests[0]!.reference);
    expect((await readOrder(app, order.id)).tickets).toHaveLength(0);
    expect(refunds).toEqual([requests[0]!.reference]);
    expect((await attemptRow(requests[0]!.reference)).refundReason).toBe('amount_mismatch');
  });

  it('keeps a refund the provider turned down, and tries again on the next webhook', async () => {
    const app = api();
    const order = await placeOrder(app);
    const ref = requests[0]!.reference;
    refundWorks = false;
    answers.set(ref, paid(5));
    await webhook(app, ref);
    expect((await attemptRow(ref)).refundStatus).toBe('due');
    expect(emails).toHaveLength(0);

    refundWorks = true;
    const next = await placeOrder(app, {
      buyer: { name: 'Baraka Mwangi', phone: nextPhone(), email: 'baraka@example.com' },
    });
    answers.set(requests[1]!.reference, paid(120000));
    await webhook(app, requests[1]!.reference);
    expect((await attemptRow(ref)).refundStatus).toBe('requested');
    expect((await readOrder(app, next.id)).status).toBe('paid');
    expect(order.id).toBeTruthy();
  });
});

describe('Paystack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads its gateway responses as the failures buyers see', () => {
    expect(failureFrom('Insufficient balance', 'mpesa')).toBe('insufficient_funds');
    expect(failureFrom('Transaction cancelled by user', 'mpesa')).toBe('cancelled_by_user');
    expect(failureFrom('Invalid PIN entered', 'mpesa')).toBe('wrong_pin');
    expect(failureFrom('Request timed out', 'mpesa')).toBe('timeout');
    expect(failureFrom('Declined', 'card')).toBe('declined');
    expect(failureFrom('Insufficient Funds', 'card')).toBe('insufficient_funds');
    expect(failureFrom('Something odd', 'mpesa')).toBe('unknown');
  });

  it('accepts only webhooks signed with the secret key, for charges', () => {
    const p = paystackPayments('sk_test_secret');
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'pay-abc' } });
    const sign = (b: string, key = 'sk_test_secret') =>
      createHmac('sha512', key).update(b).digest('hex');
    const headers = (sig: string) => (name: string) =>
      name === 'x-paystack-signature' ? sig : undefined;

    expect(p.webhookReference!(body, headers(sign(body)))).toBe('pay-abc');
    expect(p.webhookReference!(body, headers(sign(body, 'sk_test_other')))).toBeNull();
    expect(p.webhookReference!(body, headers(''))).toBeNull();
    const transfer = JSON.stringify({ event: 'transfer.success', data: { reference: 'x' } });
    expect(p.webhookReference!(transfer, headers(sign(transfer)))).toBeNull();
  });

  it('sends M-Pesa through the Charge API and cards to a checkout page', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      const data = url.endsWith('/charge')
        ? { status: 'pay_offline' }
        : { authorization_url: 'https://checkout.paystack.com/abc' };
      return new Response(JSON.stringify({ status: true, data }));
    });
    const p = paystackPayments('sk_test_secret');
    const base = {
      reference: 'pay-1',
      amountMinor: 120000,
      currency: 'KES' as const,
      email: 'a@example.com',
      phone: '+254712345678',
      orderId: 'ord_1',
      returnUrl: 'https://tickets.test/e/x/checkout/ord_1',
    };
    expect(await p.request({ ...base, method: 'mpesa' })).toEqual({ ok: true, paymentUrl: null });
    expect(calls[0]).toMatchObject({
      url: 'https://api.paystack.co/charge',
      body: {
        amount: 120000,
        currency: 'KES',
        reference: 'pay-1',
        mobile_money: { phone: '+254712345678', provider: 'mpesa' },
      },
    });
    expect(await p.request({ ...base, method: 'card' })).toEqual({
      ok: true,
      paymentUrl: 'https://checkout.paystack.com/abc',
    });
    expect(calls[1]).toMatchObject({
      url: 'https://api.paystack.co/transaction/initialize',
      body: { channels: ['card'], callback_url: base.returnUrl },
    });
  });

  it('reads Verify Transaction, treating a reference it has not seen as still pending', async () => {
    let reply: { status: number; body: unknown } = { status: 404, body: { status: false } };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(reply.body), reply));
    const p = paystackPayments('sk_test_secret');
    const attempt = {
      reference: 'pay-1',
      buyerPhone: '+254712345678',
      requestedAt: new Date(),
      amountMinor: 120000,
      currency: 'KES' as const,
    };
    expect(await p.check(attempt, 0)).toEqual({ state: 'pending' });

    reply = {
      status: 200,
      body: { status: true, data: { status: 'success', amount: 120000, currency: 'KES' } },
    };
    expect(await p.check(attempt, 0)).toEqual({
      state: 'paid',
      amountMinor: 120000,
      currency: 'KES',
    });

    reply = {
      status: 200,
      body: {
        status: true,
        data: {
          status: 'failed',
          gateway_response: 'Insufficient balance',
          channel: 'mobile_money',
        },
      },
    };
    expect(await p.check(attempt, 0)).toMatchObject({
      state: 'failed',
      failure: 'insufficient_funds',
    });
  });
});
